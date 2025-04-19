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
	 * TODO: how are u, h, and p strings decided from their ids?
	 * (u, h), (h, u) if user u has selected hashtag h as an interest
	 * (h, p), (p, h) if post p is associated with hashtag h
	 * (u, p), (p, u) if user u has “liked” post p
	 * (u1, u2), if user u1 follows user u2
	 * 
	 * @param filePath
	 * @return JavaPairRDD: (node: String, node: String)
	 * 
	 * input "followers" table: (follower, followed)
	 */
	protected JavaPairRDD<String, String> getGraph(String filePath) {
		JavaRDD<String> file = context.textFile(filePath, Config.PARTITIONS);

		// Change this to load and read data from MySQL. Return JavaPairRDD graph.

		JavaPairRDD<String, String> network = null;

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