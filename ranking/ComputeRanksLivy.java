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

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import instalite.ranking.config.Config;
import instalite.ranking.config.ConfigSingleton;
import instalite.ranking.adsorption.FeedRankJob;
import instalite.ranking.utils.SerializablePair;

import instalite.ranking.utils.FlexibleLogger;
import instalite.ranking.spark.SparkJob;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;  // If you're reading results
import java.sql.SQLException;  // For exception handling

/**
 * The `ComputeRanksLivy` class is responsible for running a social network ranking job using Apache Livy.
 * It takes command line arguments to configure the job parameters and performs the following tasks:
 * 1. Runs a SocialRankJob with backlinks set to true and writes the output to a file named "socialrank-livy-backlinks.csv".
 * 2. Runs a SocialRankJob with backlinks set to false and writes the output to a file named "socialrank-livy-nobacklinks.csv".
 * 3. Compares the top-10 results from both runs and writes the comparison to a file named "socialrank-livy-results.txt".
 * <p>
 * The class uses the Apache Livy library to submit and execute the jobs on a Livy server.
 * It also uses the SparkJob class to run the SocialRankJob and obtain the results.
 * <p>
 * To run the job, the `LIVY_HOST` environment variable must be set. If not set, the program will exit with an error message.
 */
public class ComputeRanksLivy {
    static Logger logger = LogManager.getLogger(ComputeRanksLivy.class);

    /**
     * Call Livy while requesting only 10 rows, with various config options as parameters
     */
    public static List<SerializablePair<String, SerializablePair<String, Double>>> callLivy(
        String livy, FlexibleLogger logger, Config config, double d_max, int i_max, boolean debug)
        throws IOException, URISyntaxException, InterruptedException, ExecutionException {
        FeedRankJob job = new FeedRankJob(d_max, i_max, false, debug, logger, config);

        return SparkJob.runJob(livy, job);
    }

    public static void main(String[] args)
            throws IOException, URISyntaxException, InterruptedException, ExecutionException {
        boolean debug;

        double d_max;
        int i_max;

        Config config = ConfigSingleton.getInstance();

        // Check so we'll fatally exit if the environment isn't set
        if (config.LIVY_HOST == null) {
            logger.error("LIVY_HOST not set -- update your .env and run source .env");
            System.exit(-1);
        }

        // Process command line arguments if given
        if (args.length == 1) {
            d_max = Double.parseDouble(args[0]);
            i_max = 25;
            debug = false;
        } else if (args.length == 2) {
            d_max = Double.parseDouble(args[0]);
            i_max = Integer.parseInt(args[1]);
            debug = false;
        } else if (args.length == 3) {
            d_max = Double.parseDouble(args[0]);
            i_max = Integer.parseInt(args[1]);
            debug = true;
        } else {
            d_max = 30;
            i_max = 25;
            debug = false;
        }

        String livy = SparkJob.getLivyUrl(args);
        FlexibleLogger logger = new FlexibleLogger(null, false, debug);

        List<SerializablePair<String, SerializablePair<String, Double>>> results = callLivy(livy, logger, config, d_max, i_max, debug);
        /* 
        try (PrintStream out = new PrintStream(new FileOutputStream("socialrank-livy-nobacklinks.csv"))) {
            for (SerializablePair<String, Double> item : noBacklinksResult) {
                out.println(item.getLeft() + "," + item.getRight());
            }
        } catch (Exception e) {
            logger.error("Error writing to file: " + e.getMessage());
        }*/


        // TODO: Add a second call to Apache Livy to run a SocialRankJob with the
        // back-links set to false. Write the output to a file named
        // "socialrank-livy-nobacklinks.csv"

        logger.info("*** Finished social network ranking! ***");

    }

}
