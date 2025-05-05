package instalite.ranking.adsorption;

import java.io.IOException;
import java.util.HashSet;
import java.util.LinkedList;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.Arrays;
import java.util.Comparator;

import java.util.stream.Collectors;
import java.io.BufferedWriter;
import java.io.FileWriter;
import java.util.Properties;

import java.lang.Math;

import instalite.ranking.utils.FlexibleLogger;
import org.apache.livy.Job;
import org.apache.livy.JobContext;
import org.apache.livy.LivyClient;
import org.apache.livy.LivyClientBuilder;
import org.apache.spark.api.java.JavaPairRDD;
import org.apache.spark.api.java.JavaRDD;

import instalite.ranking.config.Config;
import instalite.ranking.utils.SerializablePair;
import instalite.ranking.spark.SparkJob;

import scala.Tuple2;

public class FeedRankJob extends SparkJob<List<SerializablePair<String, SerializablePair<String, Double>>>> {
	// Convergence condition variables
	double d_max; // largest change in a node's rank from iteration i to iteration i+1
	int i_max; // max number of iterations

	private String source;

	public FeedRankJob(double d_max, int i_max, boolean isLocal, boolean debug, FlexibleLogger logger, Config config) {
		super(logger, config, isLocal, debug);
		this.useBacklinks = useBacklinks;
		this.d_max = d_max;
		this.i_max = i_max;
		this.max_answers = answers;
	}

	/**
	 * Fetch the posts database and create a graph with the following edges:
	 * 
	 * user ids: 'u_...'; post ids: 'p_...'; hashtags: '#[hashtag]'
	 * (u, h), (h, u) if user u has selected hashtag h as an interest
	 * (h, p), (p, h) if post p is associated with hashtag h
	 * (u, p), (p, u) if user u has “liked” post p
	 * (u1, u2), if user u1 follows user u2
	 * 
	 * @param filePath
	 * @return JavaPairRDD: (node: String, node: String)
	 * 
	 * input "followers" table: (follower, followed)
	 * 
	 * Used this source for setup instructions.
	 * https://spark.apache.org/docs/3.5.0/sql-data-sources-jdbc.html
	 * 
	 */
	protected JavaPairRDD<String, String> getGraph(String placeholder) {
		// Set up connection to Amazon RDS and configure with credentials.
		Properties connectionProperties = new Properties(); // required for spark.read()
		connectionProperties.put("user", Config.MYSQL_USER);
		connectionProperties.put("password", Config.MYSQL_PASSWORD);
		connectionProperties.put("driver", Config.JDBC_DRIVER);

		// Read data from MySQL
		Dataset<Row> posts = spark.read().jdbc(Config.MYSQL_URL, "posts", connectionProperties);
		Dataset<Row> likes = spark.read().jdbc(Config.MYSQL_URL, "likes", connectionProperties);
		Dataset<Row> friends = spark.read().jdbc(Config.MYSQL_URL, "friends", connectionProperties);
		Dataset<Row> hashtags = spark.read().jdbc(Config.MYSQL_URL, "hashtags", connectionProperties);

		logger.info("Creating graph");

		// Create JavaPairRDD between users with at least one following the other.
		JavaPairRDD<String, String> friendEdges = friends.javaRDD()
			.flatMapToPair(row -> {
					String followed = row.getAs("followed"); // returns user_id
					String follower = row.getAs("follower"); // returns user_id
					return Arrays.asList(
							new Tuple2<>(followed, follower),
							new Tuple2<>(follower, followed)
					).iterator();
			});

		// Create JavaPairRDD from user to liked posts.
		JavaPairRDD<String, String> likeEdges = likes.javaRDD()
			.flatMapToPair(row -> {
					String user = row.getAs("user_id");
					String post = "post:" + row.getAs("post_id"); // add "post:" to avoid id collisions
					return Arrays.asList(
							new Tuple2<>(user, post),
							new Tuple2<>(post, user)
					).iterator();
			});

		// Create JavaPairRDD from user to selected hashtag interests.
		JavaPairRDD<String, String> hashtagEdges = hashtags.javaRDD()
			.flatMapToPair(row -> {
					String user = row.getAs("user_id");
					String hashtagRow = row.getAs("hashtag");
					String[] hashtags = hashtagRow.split(",");
					List<Tuple2<String, String>> tuples = new ArrayList<>();
					for (String hashtag: hashtags) {
						edges.add(new Tuple2<>(user, "hashtag:" + hashtag)); // use "hashtag:" to avoid id collisions
						edges.add(new Tuple2<>("hashtag:" + hashtag, user));
					}
					return tuples.iterator();
			});

		// Create JavaPairRDD from post to hashtag contained in the post content.
		JavaPairRDD<String, String> hashtagPostEdges = posts.javaRDD()
			.flatMapToPair(row -> {
					String post_id = row.getAs("post_id");
					String hashtagRow = row.getAs("hash_tags");
					String[] hashtags = hashtagRow.split(",");
					List<Tuple2<String, String>> tuples = new ArrayList<>();
					for (String hashtag: hashtags) {
						edges.add(new Tuple2<>("post:" + post_id, "hashtag:" + hashtag));
						edges.add(new Tuple2<>("hashtag:" + hashtag, "post:" + post_id));
					}
					return tuples.iterator();
			});

		JavaPairRDD<String, String> network = friendEdges
			.union(hashtagEdges)
			.union(likeEdges)
			.union(hashtagPostEdges);;

		return network;
	}

	/**
	 * 
	 * Main functionality in the program: read and process the social network
	 * Runs the FeedRankJob and stores final (user_id, post_id, ranking) weights in rankings table in RDS.
	 *
	 * @param debug a boolean indicating whether to enable debug mode
	 * @return a list of SerializablePair objects representing the top 10 nodes with their corresponding SocialRank values
	 * @throws IOException if there is an error reading the social network file
	 * @throws InterruptedException if the execution is interrupted
	 */
	public List<SerializablePair<String, SerializablePair<String, Double>> run(boolean debug)
		throws IOException, InterruptedException {
		logger.info("Running rankings");

		// Load the social network (e.g. from MySQL, RDS)
		JavaPairRDD<String, String> edgeRDD = getGraph(Config.SOCIAL_NET_PATH);

		// Group by source node of edge (note that edges are bidirectional)
		JavaPairRDD<String, Iterable<String>> edgesGroupedBySource = edgeRDD.groupByKey();

		// Calculate weights for all edges
    JavaPairRDD<String, Tuple2<String, Double>> weightedEdges = edgesGroupedBySource.flatMapToPair(tuple -> {
			String source = tuple._1();
			Iterable<String> destinations = tuple._2();
			
			// Count number of edges for each destination type (hashtags, posts, users)
			List<String> destList = new ArrayList<>();
			for (String dest: destinations) {
				destList.add(dest);
			}
			
			int userEdges = 0;
			int hashtagEdges = 0;
			int postEdges = 0;
			
			for (String dest : destList) {
				if (dest.startsWith("hashtag:")) hashtagEdges++;
				else if (dest.startsWith("post:")) postEdges++;
				else userEdges++;
			}
			
			// Calculate weights based on node type: (sourceNode, (destNode, edgeWeight))
			List<Tuple2<String, Tuple2<String, Double>>> weightedEdgeList = new ArrayList<>();
			for (String dest : destList) {
				double weight = 0.0;
				if (source.startsWith("hashtag:")) {
					// Outgoing edges from hashtags have equal weights that sum to 1
					weight = 1.0 / destList.size();
				} 
				else if (source.startsWith("post:")) {
					// Outgoing edges from posts have equal weights that sum to 1
					weight = 1.0 / destList.size();
				} 
				else {
					// Outgoing edges from users
					if (dest.startsWith("hashtag:")) {
						weight = 0.3 / hashtagEdges;
					} else if (dest.startsWith("post:")) {
						weight = 0.4 / postEdges;
					} else {
						weight = 0.3 / userEdges;
					}
				}
				Tuple2<String, Double> pair = new Tuple2<>(dest, weight);
				weightedEdgeList.add(new Tuple2<>(source, pair));
			}

			return weightedEdgeList.iterator();
		});

		// Start with user labels equal to 1.0; tuples are (sourceNodeLabel, (destNode, labelWeight))
		JavaPairRDD<String, Tuple2<String, Double>> labels = edgeRDD.mapToPair(edge -> edge._1()) 
			.distinct() // source nodes only
			.flatMapToPair(node -> {
				List<Tuple2<String, Tuple2<String, Double>>> initialLabels = new ArrayList<>();
				if (!node.startsWith("hashtag:") && !node.startsWith("post:")) {
					initialLabels.add(new Tuple2<>(node, new Tuple2<>(node, 1.0)));
				}
				return initialLabels.iterator();
			});

		// Adsorption
		int maxLabelDifference = 0;
		for (int i = 0; i < i_max; i++) {
			// Join labels with weighted edges to propagate
			JavaPairRDD<String, Tuple2<String, Double>> newLabels = labels
				.join(weightedEdges)
				.mapToPair(tuple -> {
					// tuple structure: (sourceNodeLabel, ((destNode, labelWeight), (destNode, edgeWeight)))
					String neighbor = tuple._2()._2()._1();
					double oldLabelWeight = tuple._2()._1()._2();
					double newWeight = oldLabelWeight * tuple._2()._2()._2();
					labelDifference = Math.abs(oldLabelWeight - newWeight);
					if (labelDifference > maxLabelDifference) maxLabelDifference = labelDifference;
					return new Tuple2<>(neighbor, new Tuple2<>(tuple._2()._1()._1(), newWeight));
				})
				.reduceByKey((a, b) -> {
					// For the same node and label, sum the weights
					if (a._1().equals(b._1())) {
						return new Tuple2<>(a._1(), a._2() + b._2());
					} else {
						// This shouldn't happen in this step, but handle just in case
						return a._2() > b._2() ? a : b;
					}
				});
				
			// Check for convergence
			if (d_max > maxLabelDifference) break;
			
			labels = newLabels;

			// Sum weights per node for normalization
			JavaPairRDD<String, Double> nodeSums = labels
				.mapValues(pair -> pair._2()) // extract label weight only
				.reduceByKey((a, b) -> a + b); // sum label weights

			// Divide each label by its node's sum
			labels = labels
				.join(nodeSums) // (sourceNode, ((destNode, labelWeight), sum))
				.mapToPair(tuple -> {
					String node = tuple._1();
					String label = tuple._2()._1()._1();
					double weight = tuple._2()._1()._2();
					double sum = tuple._2()._2();
					return new Tuple2<>(node, new Tuple2<>(label, weight / sum));
				});
		}

		return getTopRecommendations(labels);;
	}

	@Override
	public List<SerializablePair<String, Double>> call(JobContext arg0) throws Exception {
		initialize();
		return run(false);
	}

	// Get list of posts with weights for rankings database (for feed)
	public List<SerializablePair<String, SerializablePair<String, Double>>> getTopRecommendations(
    JavaPairRDD<String, Tuple2<String, Double>> labels) {

    // 1) Filter for post nodes and map to (user, (post, weight)) tuples
    JavaPairRDD<String, Tuple2<String, Double>> userPostWeights = labels
			.filter(pair -> pair._1().startsWith("post:"))  // Keep only post nodes
			.flatMap(tuple -> {
				String post = tuple._1();
				String user = tuple._2()._1();  // Original user who propagated the label
				double weight = tuple._2()._2();
				return Arrays.asList(new Tuple2<>(user, new Tuple2<>(post, weight))).iterator();
			});

    // 2) Turn Tuple2s to SerializablePairs to work with Livy
		List<SerializablePair<String, SerializablePair<String, Double>> postList = userPostWeights
			.map(pair -> {
				SerializablePair<String, Double> postWeightPair = new SerializablePair<>(pair._2()._1(), pair._2()._1());
				return new SerializablePair<>(pair._1(), postWeightPair);
			});

		return postList;
	}

}