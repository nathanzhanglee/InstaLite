package instalite.ranking;

import java.io.File;
import java.io.FileOutputStream;
import java.io.FileWriter;
import java.io.IOException;
import java.io.PrintStream;
import java.net.URISyntaxException;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.stream.Collectors;
import java.lang.ClassNotFoundException;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import instalite.ranking.config.Config;
import instalite.ranking.config.ConfigSingleton;
import instalite.ranking.friends.FriendsOfFriendsJob;
import instalite.ranking.utils.SerializablePair;

import instalite.ranking.utils.FlexibleLogger;
import instalite.ranking.spark.SparkJob;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;  // If you're reading results
import java.sql.SQLException;  // For exception handling

/** ComputeRecsLivy
 * The class uses the Apache Livy library to submit and execute the jobs on a Livy server.
 * It also uses the SparkJob class to run the SocialRankJob and obtain the results.
 * To run the job, the `LIVY_HOST` environment variable must be set. If not set, the program will exit with an error message.
 */
public class ComputeRecsLivy {
    static Logger logger = LogManager.getLogger(ComputeRecsLivy.class);

    /**
     * Call Livy while requesting only 10 rows, with various config options as parameters
     */
    public static List<SerializablePair<SerializablePair<String, String>, Integer>> callLivy(
        String livy, FlexibleLogger logger, Config config, boolean debug)
        throws IOException, URISyntaxException, InterruptedException, ExecutionException {
        FriendsOfFriendsJob job = new FriendsOfFriendsJob(false, debug, logger, config);

        return SparkJob.runJob(livy, job);
    }

    public static void main(String[] args)
            throws IOException, URISyntaxException, InterruptedException, ExecutionException {
        boolean debug;

        Config config = ConfigSingleton.getInstance();

        // Check so we'll fatally exit if the environment isn't set
        if (config.LIVY_HOST == null) {
            logger.error("LIVY_HOST not set -- update your .env and run source .env");
            System.exit(-1);
        }

        // Process command line arguments if given
        if (args.length == 1) {
            debug = true;
        } else {
            debug = false;
        }

        String livy = SparkJob.getLivyUrl(args);
        FlexibleLogger logger = new FlexibleLogger(null, false, debug);

        List<SerializablePair<SerializablePair<String, String>, Integer>> recs = callLivy(livy, logger, config, debug);
  
        logger.info("*** Finished getting recs! ***");

        // MySQL connection setup
        String url = "jdbc:mysql://" + Config.MYSQL_HOST + ":" + Config.MYSQL_PORT + "/" + Config.MYSQL_DATABASE;

        String query = "INSERT INTO recommendations (person, recommendation, strength) VALUES (?, ?, ?) "
            + "ON DUPLICATE KEY UPDATE strength = VALUES(strength)";

        try {
            // Explicitly load the MySQL JDBC driver
            Class.forName("com.mysql.cj.jdbc.Driver");

            Connection conn = DriverManager.getConnection(url, Config.MYSQL_USER, Config.MYSQL_PASSWORD);
            PreparedStatement statement = conn.prepareStatement(query);

            for (SerializablePair<SerializablePair<String, String>, Integer> item : recs) {
                logger.info("rec item: " + item.getLeft().getLeft() + "\t" + item.getLeft().getRight() + "\t" + item.getRight());
                int userId = Integer.parseInt(item.getLeft().getLeft());
                int recUserId = Integer.parseInt(item.getLeft().getRight());
                int strength = item.getRight();

                statement.setInt(1, userId);
                statement.setInt(2, recUserId);
                statement.setInt(3, strength);
                statement.addBatch();
            }
            statement.executeBatch();
            logger.info("Stored " + recs.size() + " items in recommendations table");
        } catch (SQLException ex) {
            logger.info("error with sql"); 
            ex.printStackTrace();
        } catch(ClassNotFoundException ex) {
            logger.info("class not found");
            ex.printStackTrace();
        }

    }

}
