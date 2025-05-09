package instalite.ranking.friends;

import java.io.File;
import java.io.IOException;
import java.io.PrintWriter;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.*;

import javax.xml.crypto.Data;

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

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.apache.spark.api.java.JavaSparkContext;

import instalite.ranking.config.Config;
import instalite.ranking.utils.SerializablePair;
import instalite.ranking.spark.SparkJob;
import instalite.ranking.spark.SparkConnector;
import scala.Tuple2;

public class FriendsOfFriendsJob extends SparkJob<List<SerializablePair<SerializablePair<String, String>, Integer>>> {
    public FriendsOfFriendsJob(boolean isLocal, boolean debug, FlexibleLogger logger, Config config) {
        super(logger, config, isLocal, debug);
    }

    // Get (followed, follower) tuples
    private JavaPairRDD<String, String> loadFollowersRDD() {
        logger.info("[FriendsOfFriends] Loading followers from database...");
        
        // Read data from MySQL using Spark JDBC
        Properties connectionProperties = new Properties();
        connectionProperties.put("user", Config.MYSQL_USER);
        connectionProperties.put("password", Config.MYSQL_PASSWORD);
        connectionProperties.put("driver", Config.JDBC_DRIVER);

        String url = "jdbc:mysql://" + Config.MYSQL_HOST + ":" + Config.MYSQL_PORT + "/" + Config.MYSQL_DATABASE;
        
        Dataset<Row> friends = spark.read().jdbc(url, "friends", connectionProperties);
        
        // Convert to (followed, follower) pairs
        JavaPairRDD<String, String> edgeRDD = friends.javaRDD()
            .mapToPair(row -> new Tuple2<>(
                row.getAs("followed").toString(),
                row.getAs("follower").toString()
            ));
            
        logger.info("[FriendsOfFriends] Loaded " + edgeRDD.count() + " follower relationships");
        return edgeRDD;
    }

    // (followed, follower) RDD -> ((user, recommendation), strength) RDD
    private JavaPairRDD<Tuple2<String, String>, Integer> generateRecommendations(
        JavaPairRDD<String, String> network) {
      
        logger.info("[FriendsOfFriends] Generating recommendations...");
        
        // Step 1: Create (follower, followed) tuples and group by follower
        JavaPairRDD<String, Iterable<String>> groupedByFollower = network
            .mapToPair(t -> new Tuple2<>(t._2(), t._1())) // Swap to (follower, followed)
            .groupByKey();
            
        // Step 2: Create map of user to list of users they follow
        Map<String, Iterable<String>> groupedByFollowerMap = groupedByFollower.collectAsMap();
            
        // Step 3: Generate potential recommendations (friends of friends)
        JavaPairRDD<Tuple2<String, String>, Integer> recommendationsWithStrength = groupedByFollower
            .flatMapToPair(entry -> {
                List<Tuple2<Tuple2<String, String>, Integer>> recommendationList = new ArrayList<>();
                // Look up the users followed by the current FOLLOWER user
                Iterable<String> followeds = groupedByFollowerMap.getOrDefault(entry._1(),
                    Collections.emptyList());
                // Convert into a set for efficient lookup with .contains later
                Set<String> followedSet = new HashSet<>();
                followeds.forEach(followedSet::add);
                for (String followed : followeds) {
                    // Look up the users followed by the current FOLLOWED user
                    Iterable<String> followedByFollowed = groupedByFollowerMap.getOrDefault(followed,
                        Collections.emptyList());
                    for (String potentialRec : followedByFollowed) {
                        // Filter out self-recommendations and recs already followed
                        if (!potentialRec.equals(entry._1()) && !followedSet.contains(potentialRec)) { 
                            Tuple2<String, String> recommendation = new Tuple2<>(entry._1(), potentialRec);
                            recommendationList.add(new Tuple2<>(recommendation, 1)); // Initialize strength to 1
                        }
                    }
                }
                return recommendationList.iterator();
            });
            
        // Step 4: Aggregate recommendations by strength
        JavaPairRDD<Tuple2<String, String>, Integer> recommendationStrengths = recommendationsWithStrength
            .reduceByKey((a, b) -> a + b);
            
        logger.info("[FriendsOfFriends] Generated " + recommendationStrengths.count() + " recommendations");
        return recommendationStrengths;
    }

    /**
     * Main execution method
     * @return List of recommendations in format ((user, recommended_user), strength)
     */
    public List<SerializablePair<SerializablePair<String, String>, Integer>> run(boolean debug) throws IOException, InterruptedException {
        initialize();
        
        // Load follower network
        JavaPairRDD<String, String> network = loadFollowersRDD();
        
        // Generate recommendations
        JavaPairRDD<Tuple2<String, String>, Integer> recommendations = generateRecommendations(network);
        
        // Collect and return results as SerializablePairs
        return recommendations
            .map(pair -> new SerializablePair<>(
                new SerializablePair<>(pair._1._1(), pair._1()._2()),
                pair._2()
            ))
            .collect(); 
    }

    @Override
    public List<SerializablePair<SerializablePair<String, String>, Integer>> call(JobContext ctx) throws Exception {
        return run(false);
    }

    public static void main(String[] args) {
        Config config = new Config();
        boolean isLocal = args.length > 0 && args[0].equals("--local");
        boolean debug = args.length > 1 && args[1].equals("--debug");
        FlexibleLogger rankLogger = new FlexibleLogger(LogManager.getLogger(SparkJob.class), true, debug);
        FriendsOfFriendsJob fof = new FriendsOfFriendsJob(isLocal, debug, rankLogger, config);
        try {
            List<SerializablePair<SerializablePair<String, String>, Integer>> recommendations = fof.run(debug);
            //fof.storeRecommendations(recommendations);
        } catch (Exception e) {
            //logger.error("Error in main execution: " + e.getMessage());
        } finally {
            fof.shutdown();
        }
    }
}