package instalite.ranking.adsorption;

import java.io.IOException;
import java.util.HashSet;
import java.util.LinkedList;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Iterator;

import java.util.stream.Collectors;
import java.io.BufferedWriter;
import java.io.FileWriter;
import java.io.Serializable;
import java.util.Properties;

import java.lang.Math;

import instalite.ranking.utils.FlexibleLogger;
import org.apache.livy.Job;
import org.apache.livy.JobContext;
import org.apache.livy.LivyClient;
import org.apache.livy.LivyClientBuilder;
import org.apache.spark.api.java.JavaPairRDD;
import org.apache.spark.api.java.function.PairFlatMapFunction; // for casting
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
		String url = "jdbc:mysql://" + Config.MYSQL_HOST + ":" + Config.MYSQL_PORT + "/" + Config.MYSQL_DATABASE;

		Dataset<Row> posts = spark.read().jdbc(url, "posts", connectionProperties);
		Dataset<Row> likes = spark.read().jdbc(url, "likes", connectionProperties);
		Dataset<Row> friends = spark.read().jdbc(url, "friends", connectionProperties);
		Dataset<Row> hashtags = spark.read().jdbc(url, "hashtags", connectionProperties);

		logger.info("[FeedRankJob getGraph()] Creating graph...");

		// Create JavaPairRDD between users with at least one following the other.
		JavaPairRDD<String, String> friendEdges = friends.javaRDD()
			.flatMapToPair(row -> {
					String followed = row.getAs("followed") + ""; // returns user_id
					String follower = row.getAs("follower") + ""; // returns user_id
					return Arrays.asList(
							new Tuple2<>(followed, follower),
							new Tuple2<>(follower, followed)
					).iterator();
			});
		logger.info("[FeedRankJob getGraph()] Found " + friendEdges.count() + " friendEdges");

		// Create JavaPairRDD from user to liked posts.
		JavaPairRDD<String, String> likeEdges = likes.javaRDD()
			.flatMapToPair(row -> {
					String user = row.getAs("user_id") + "";
					String post = "post:" + row.getAs("post_id"); // add "post:" to avoid id collisions
					return Arrays.asList(
							new Tuple2<>(user, post),
							new Tuple2<>(post, user)
					).iterator();
			});
		logger.info("[FeedRankJob getGraph()] Found " + likeEdges.count() + " likeEdges");

		// Create JavaPairRDD from user to selected hashtag interests.
		JavaPairRDD<String, String> hashtagEdges = hashtags.javaRDD()
			.flatMapToPair(row -> {
					String user = row.getAs("user_id") + "";
					String hashtagRow = row.getAs("hashtag");
					String[] hashtagArr = hashtagRow.split(",");
					List<Tuple2<String, String>> tuples = new ArrayList<>();
					for (String hashtag: hashtagArr) {
						tuples.add(new Tuple2<>(user, "hashtag:" + hashtag)); // use "hashtag:" to avoid id collisions
						tuples.add(new Tuple2<>("hashtag:" + hashtag, user));
					}
					return tuples.iterator();
			});
		logger.info("[FeedRankJob getGraph()] Found " + hashtagEdges.count() + " hashtagEdges");

		// Create JavaPairRDD from post to hashtag contained in the post content.
		JavaPairRDD<String, String> hashtagPostEdges = posts.javaRDD()
			.flatMapToPair(row -> {
					String post_id = row.getAs("post_id") + "";
					String hashtagRow = row.getAs("hashtags");
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

		logger.info("[FeedRankJob getGraph()] Graph created!");
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
		logger.info("[FeedRankJob run()] Running rankings...");

		// Load the social network (e.g. from MySQL, RDS)
		JavaPairRDD<String, String> edgeRDD = getGraph(Config.SOCIAL_NET_PATH);

		// Group by source node of edge (note that edges are bidirectional)
		// Ex. (user, (user, post, hashtag)), (post, (user, hashtag, user)), (hashtag, (user, post, post))
		JavaPairRDD<String, Iterable<String>> edgesGroupedBySource = edgeRDD.groupByKey();
		logger.info("[FeedRankJob run()] After edgesGroupedBySource");

		// Calculate weights for all edges; lambda function needs help inferring type 
		// "weightedEdges" tuples are (source, (dest, weight))
    JavaPairRDD<String, Tuple2<String, Double>> weightedEdges = edgesGroupedBySource.flatMapToPair(
			(PairFlatMapFunction<Tuple2<String, Iterable<String>>, String, Tuple2<String, Double>>) FeedRankJob::computeWeightedEdges
		);
		logger.info("[FeedRankJob run()] Computed weighted edges");

		// Note: "labels" are source node; each current (dest) node has multiple (label, labelWeight) tuples.
		// "labels" tuples are (current, (label, labelWeight))
		JavaPairRDD<String, Tuple2<String, Double>> labels = edgeRDD.map(edge -> edge._1()) 
			.distinct() // source nodes only
			.filter(node -> !(node.startsWith("hashtag:")) && !(node.startsWith("post:"))) // only user nodes
			.mapToPair(FeedRankJob::initializeLabels);
		logger.info("[FeedRankJob run()] Initialized labels with size " + labels.count());

		// Adsorption
		for (int i = 0; i < i_max; i++) {
			logger.info("[FeedRankJob run()] Starting adsorption iteration " + i);

			// 1) Main propagation:
			// 		(current, (label, labelWeight))
			//			-> (current, ((label, labelWeight), (neighbor, edgeWeight))
			// 			-> (neighbor, (label, labelWeight * edgeWeight))
			JavaPairRDD<String, Tuple2<String, Double>> newLabels = labels
				.join(weightedEdges)
				.mapToPair(FeedRankJob::mapToNewLabel);
			logger.info("[FeedRankJob run()] Calculated unnormalized new labels");

			// 2) Normalization: find sum of label weights at each node
			// 		(current, (label, labelWeight))
			//			-> (current, totalLabelWeight)
			JavaPairRDD<String, Double> nodeTotalLabelWeights = newLabels
				.mapToPair(tuple -> // Extract (current, labelWeight)
					new Tuple2<>(tuple._1(), tuple._2()._2())
				)
				.reduceByKey((a, b) -> a + b); // Sum label weights
			
			// 3) Normalization: divide by sums for new label weights
			//		(current, (label, labelWeight))
			//			-> (current, ((label, labelWeight), totalLabelWeight))
			//			-> (current, (label, normalizedLabelWeight))
			JavaPairRDD<String, Tuple2<String, Double>> normalizedLabels = newLabels
				.join(nodeTotalLabelWeights)
				.mapToPair(tuple -> {
					String current = tuple._1();
					String label = tuple._2()._1()._1();
					double normalizedLabelWeight = tuple._2()._1()._2() / tuple._2()._2();
					return new Tuple2<>(current, new Tuple2<>(label, normalizedLabelWeight));
				});
			logger.info("[FeedRankJob run()] Normalized new labels");

			// 4) Find differences in each label
			// 		(current, ((newLabel, newWeight), (oldLabel, oldWeight)))
			//			-> labelWeightDifference
			JavaRDD<Double> labelDifferences = normalizedLabels
				.join(labels)
				.map(tuple -> Math.abs(tuple._2()._1()._2() - tuple._2()._2()._2()));
			
			// 5) Get max difference to check for convergence later
			double maxDifference = labelDifferences.reduce(Math::max);

			labels = normalizedLabels;

			logger.info("[FeedRankJob run()] Labels count: " + labels.count());
			logger.info("[FeedRankJob run()] Max label difference: " + maxDifference);

			// Check for convergence after at least 2 iterations
			if ((i > 0) && (d_max > maxDifference)) break;
		}

		logger.info("[FeedRankJob run()] Finished rankings!");
		
		return getTopRecommendations(labels);
	}

	@Override
	public List<SerializablePair<String, SerializablePair<String, Double>>> call(JobContext arg0) throws Exception {
		initialize();
		return run(false);
	}

	// Get weighted edges (in an iterator) for a given source node
	private static Iterator<Tuple2<String, Tuple2<String, Double>>> computeWeightedEdges(Tuple2<String, Iterable<String>> tuple) {
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
	}

	// Tuple format: (current node, (source/label, labelWeight))
	public static Tuple2<String, Tuple2<String, Double>> initializeLabels(String node) {
		return new Tuple2<>(node, new Tuple2<>(node, 1.0));
	}

	// Propagate label to neighbors
	public static Tuple2<String, Tuple2<String, Double>> mapToNewLabel(
		Tuple2<String, Tuple2<Tuple2<String, Double>, Tuple2<String, Double>>> tuple) {
		// input tuple structure: (current, ((label, labelWeight), (neighbor, edgeWeight)))
		String neighbor = tuple._2()._2()._1();
		String label = tuple._2()._1()._1();
		String current = tuple._1();
		double labelWeight = tuple._2()._1()._2();
		double edgeWeight = tuple._2()._2()._2();
		double neighborLabelWeight = labelWeight * edgeWeight;

		return new Tuple2<>(neighbor, new Tuple2<>(label, neighborLabelWeight));
	}

	// Transform to (sourceNode/label, ((destNode, newWeight), difference))
	public static Tuple2<String, Tuple2<Tuple2<String, Double>, Double>> mapToLabelDifference(
		Tuple2<String, Tuple2<Tuple2<String, Double>, Tuple2<String, Double>>> tuple) {
		// input tuple structure: (source/label, ((dest, labelWeight), (dest, edgeWeight)))
		String dest = tuple._2()._2()._1();
		String sourceNode = tuple._1();
		double oldLabelWeight = tuple._2()._1()._2();
		double newWeight = oldLabelWeight * tuple._2()._2()._2();
		double labelDifference = Math.abs(oldLabelWeight - newWeight);
		return new Tuple2<>(
			sourceNode,
			new Tuple2<>(
				new Tuple2<>(dest, newWeight),
				labelDifference
			)
		);
	}

	// Sequence function for aggregateByKey (for computing sum of weights and max difference)
	public static Tuple2<Tuple2<String, Double>, Double> sequenceFunction(
		Tuple2<Tuple2<String, Double>, Double> acc,
		Tuple2<Tuple2<String, Double>, Double> value) {

		Tuple2<String, Double> currentLabel = value._1(); // preserve dest node and label weight
		double currentDiff = value._2();
		
		// Initialize if the accumulator is empty
		if (acc._1()._1().isEmpty()) {
				return new Tuple2<>(currentLabel, currentDiff);
		} else {
			// Accumulate sum of label weights (for each source node) and find max difference
			double sum = acc._1()._2() + currentLabel._2();
			double maxDiff = Math.max(acc._2(), currentDiff);

			// Update the label that corresponds with the max difference
			String maxLabel = null;
			if (acc._2() > currentDiff) {
				maxLabel = acc._1()._1();
			} else {
				maxLabel = currentLabel._1();
			}

			return new Tuple2<>(new Tuple2<>(maxLabel, sum), maxDiff);
		}
	}

	// Combiner function for aggregateByKey (merges partial aggregates from different partitions)
	public static Tuple2<Tuple2<String, Double>, Double> combinerFunction(
		Tuple2<Tuple2<String, Double>, Double> acc1, // ((destNode, sumOfWeights), maxDifference)
		Tuple2<Tuple2<String, Double>, Double> acc2) {
		double sum = acc1._1()._2() + acc2._1()._2();
		double maxDiff = Math.max(acc1._2(), acc2._2());
		String maxLabel = null;
			if (acc1._2() > acc2._2()) {
				maxLabel = acc1._1()._1();
			} else {
				maxLabel = acc2._1()._1();
			}
		return new Tuple2<>(new Tuple2<>(maxLabel, sum), maxDiff);
	}

	// Input is ((destNode, sumOfWeights), maxDifference)), from "aggregated" RDD
	public static double extractMaxDifference(Tuple2<Tuple2<String, Double>, Double> tuple) {
    return tuple._2();  // Extract the second value (maxDifference)
	}

	// Input is ((destNode, sumOfWeights), maxDifference)), from "aggregated" RDD
	public static double extractSumOfWeights(Tuple2<Tuple2<String, Double>, Double> tuple) {
    return tuple._1()._2(); 
	}

	// Input is ((destNode, newWeight), difference))
	public static Tuple2<String, Double> extractNewLabel(Tuple2<Tuple2<String, Double>, Double> tuple) {
    return tuple._1(); 
	}

	// Helper function to map node labels to their normalized versions (using sum)
	public static Tuple2<String, Tuple2<String, Double>> normalizeLabel(
		Tuple2<String, Tuple2<Tuple2<String, Double>, Double>> tuple) {
		String node = tuple._1();
		String label = tuple._2()._1()._1();  // Extract the label
		double weight = tuple._2()._1()._2();  // Extract the label's weight
		double sum = tuple._2()._2();  // Extract the node sum

		// Return the new Tuple2 with the normalized weight
		return new Tuple2<>(node, new Tuple2<>(label, weight / sum));
	}

	// Get list of posts with weights for rankings database (for feed)
	public List<SerializablePair<String, SerializablePair<String, Double>>> getTopRecommendations(
    JavaPairRDD<String, Tuple2<String, Double>> labels) {

    // 1) Filter for (post, (user, weight)) tuples, from (current, (label, labelWeight)) tuples
    JavaPairRDD<String, Tuple2<String, Double>> userPostWeights = labels
			.filter(pair -> {
				// Keep edges with posts as dest nodes, users as sources
				String current = pair._1();
				String label = pair._2()._1();
				return !label.startsWith("hashtag:") && !label.startsWith("post:") && current.startsWith("post:");
			});

    // 2) Turn Tuple2s to SerializablePairs of (user, (post, weight)) to work with Livy
		return userPostWeights
			.map(pair -> new SerializablePair<>(
				pair._2()._1(),
				new SerializablePair<>(pair._1(), pair._2()._2())
			))
			.collect(); // returns List<SerializablePair<String, SerializablePair<String, Double>>>
	}

}