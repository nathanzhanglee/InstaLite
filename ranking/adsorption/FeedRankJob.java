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
import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.SparkSession;

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
		this.d_max = d_max;
		this.i_max = i_max;
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
					String[] hashtagArr = hashtagRow.split(",");
					List<Tuple2<String, String>> tuples = new ArrayList<>();
					for (String hashtag: hashtagArr) {
						tuples.add(new Tuple2<>(user, "hashtag:" + hashtag)); // use "hashtag:" to avoid id collisions
						tuples.add(new Tuple2<>("hashtag:" + hashtag, user));
					}
					return tuples.iterator();
			});

		// Create JavaPairRDD from post to hashtag contained in the post content.
		JavaPairRDD<String, String> hashtagPostEdges = posts.javaRDD()
			.flatMapToPair(row -> {
					String post_id = row.getAs("post_id");
					String hashtagRow = row.getAs("hash_tags");
					String[] hashtagArr = hashtagRow.split(",");
					List<Tuple2<String, String>> tuples = new ArrayList<>();
					for (String hashtag: hashtagArr) {
						tuples.add(new Tuple2<>("post:" + post_id, "hashtag:" + hashtag));
						tuples.add(new Tuple2<>("hashtag:" + hashtag, "post:" + post_id));
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
	public List<SerializablePair<String, SerializablePair<String, Double>>> run(boolean debug)
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
		JavaPairRDD<String, Tuple2<String, Double>> labels = edgeRDD.map(edge -> edge._1()) 
			.distinct() // source nodes only
			.mapToPair(node -> {
				return new Tuple2<>(node, new Tuple2<>(node, 1.0));
			});

		// Adsorption
		for (int i = 0; i < i_max; i++) {
			// Transform to (sourceNode/label, ((destNode, newWeight), difference))
			JavaPairRDD<String, Tuple2<Tuple2<String, Double>, Double>> labeledDifferences = labels
				.join(weightedEdges)
				.mapToPair(tuple -> {
					// tuple structure: (sourceNodeLabel, ((destNode, labelWeight), (destNode, edgeWeight)))
					String neighbor = tuple._2()._2()._1();
					String sourceNode = tuple._1();
					double oldLabelWeight = tuple._2()._1()._2();
					double newWeight = oldLabelWeight * tuple._2()._2()._2();
					double labelDifference = Math.abs(oldLabelWeight - newWeight);
					return new Tuple2<>(
						source,
						new Tuple2<>(
							new Tuple2<>(neighbor, newWeight),
							labelDifference
						)
					);
				});

			// Aggregate to compute both sum of weights and max difference
			JavaPairRDD<String, Tuple2<Tuple2<String, Double>, Double>> aggregated = labeledDifferences
			.aggregateByKey(
				// Initial zero value: ((destNode, sumWeights), maxDifference)
				new Tuple2<>(new Tuple2<>("", 0.0), 0.0),
				
				// Sequence function 
				(acc, value) -> {
					Tuple2<String, Double> currentLabel = value._1(); // preserve dest node and label weight
					double currentDiff = value._2();
					
					if (acc._1()._1().isEmpty()) {
						return new Tuple2<>(currentLabel, currentDiff);
					} else {
						double sum = acc._1()._2() + currentLabel._2();
						double maxDiff = Math.max(acc._2(), currentDiff);
						String maxLabel = null;
						if (acc._2() > currentDiff) {
							maxLabel = acc._1()._1();
						} else {
							maxLabel = currentLabel._1();
						}
						return new Tuple2<>(
							new Tuple2<>(maxLabel, sum),
							maxDiff
						);
					}
				},
				
				// Combiner function
				(acc1, acc2) -> {
					double sum = acc1._1()._2() + acc2._1()._2();
					double maxDiff = Math.max(acc1._2(), acc2._2());
					String maxLabel = null;
						if (acc1._2() > acc2._2()) {
							maxLabel = acc1._1()._1();
						} else {
							maxLabel = acc2._1()._1();
						}
					return new Tuple2<>(
						new Tuple2<>(maxLabel, sum),
						maxDiff
					);
				}
			);

			// aggregated tuple: (sourceNode/label, ((destNode, sumOfWeights), maxDifference)))

			// destNode is the one with the max difference for a given source node in this iteration
			// sumOfWeights is used for normalization.

			// Extract the final labels: (sourceNode/label, (destNode, labelWeight))
			JavaPairRDD<String, Tuple2<String, Double>> newLabels = labeledDifferences
				.mapValues(tuple -> tuple._1());

			// Extract the max differences
			double maxLabelDifference = aggregated
				.values()
				.map(tuple -> tuple._2())
				.reduce(Math::max);
				
			// Check for convergence
			if (d_max > maxLabelDifference) break;
			
			labels = newLabels;

			// Sum weights per node for normalization
			JavaPairRDD<String, Double> nodeSums = aggregated
				.mapValues(pair -> pair._1()._2());

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

		return getTopRecommendations(labels);
	}

	@Override
	public List<SerializablePair<String, SerializablePair<String, Double>>> call(JobContext arg0) throws Exception {
		initialize();
		return run(false);
	}

	// Get list of posts with weights for rankings database (for feed)
	public List<SerializablePair<String, SerializablePair<String, Double>>> getTopRecommendations(
    JavaPairRDD<String, Tuple2<String, Double>> labels) {

    // 1) Filter for post nodes and map to (user, (post, weight)) tuples
    JavaPairRDD<String, Tuple2<String, Double>> userPostWeights = labels
			.filter(pair -> pair._1().startsWith("post:"))  // Keep only post nodes
			.mapToPair(tuple -> {
				String post = tuple._1();
				String user = tuple._2()._1();  // Original user who propagated the label
				double weight = tuple._2()._2();
				return new Tuple2<>(user, new Tuple2<>(post, weight));
			});

    // 2) Turn Tuple2s to SerializablePairs to work with Livy
		List<SerializablePair<String, SerializablePair<String, Double>>> postList = new ArrayList<>();
		userPostWeights
			.foreach(pair -> {
				SerializablePair<String, Double> postWeightPair = new SerializablePair<>(pair._2()._1(), pair._2()._2());
				postList.add(new SerializablePair<>(pair._1(), postWeightPair));
			});

		return postList;
	}

}