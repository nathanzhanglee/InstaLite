package spark;

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

import spark.utils.FlexibleLogger;
import org.apache.livy.Job;
import org.apache.livy.JobContext;
import org.apache.livy.LivyClient;
import org.apache.livy.LivyClientBuilder;
import org.apache.spark.api.java.JavaPairRDD;
import org.apache.spark.api.java.JavaRDD;

import ranking.config.Config;
import ranking.utils.SerializablePair;
import ranking.spark.SparkJob;

import scala.Tuple2;

public class FeedRankJob extends SparkJob<List<SerializablePair<String, Double>>> {
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
	 * Runs the FeedRankJob and stores final (u, p) weights in RDS.
	 *
	 * @param debug a boolean indicating whether to enable debug mode
	 * @return a list of SerializablePair objects representing the top 10 nodes with their corresponding SocialRank values
	 * @throws IOException if there is an error reading the social network file
	 * @throws InterruptedException if the execution is interrupted
	 */
	public List<SerializablePair<String, Double>> run(boolean debug) throws IOException, InterruptedException {
		logger.info("Running");

		// Load the social network (e.g. from MySQL, RDS)
		JavaPairRDD<String, String> edgeRDD = getSocialNetwork(Config.SOCIAL_NET_PATH);

		return null;
	}

	@Override
	public List<SerializablePair<String, Double>> call(JobContext arg0) throws Exception {
		initialize();
		return run(false);
	}

}