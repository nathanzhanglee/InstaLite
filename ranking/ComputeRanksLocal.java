package instalite.ranking;

import instalite.ranking.config.Config;
import instalite.ranking.config.ConfigSingleton;
import instalite.ranking.adsorption.FeedRankJob;
import instalite.ranking.utils.SerializablePair;

import instalite.ranking.utils.FlexibleLogger;
import instalite.ranking.spark.SparkJob;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.io.FileOutputStream;
import java.io.PrintStream;
import java.util.*;

import javax.security.auth.login.ConfigurationSpi;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;  // If you're reading results
import java.sql.SQLException;  // For exception handling

public class ComputeRanksLocal {
    static Logger logger = LogManager.getLogger(ComputeRanksLocal.class);

    public static void main(String[] args) {
        boolean debug;

        Config config = ConfigSingleton.getInstance();

        double d_max;
        int i_max;

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
            i_max = 15;
            debug = false;
        }

        FlexibleLogger rankLogger = new FlexibleLogger(LogManager.getLogger(SparkJob.class), true, debug);
        // No backlinks
        FeedRankJob job = new FeedRankJob(d_max, i_max, true, debug, rankLogger, config);

        List<SerializablePair<String, SerializablePair<String, Double>>> topPosts = job.mainLogic();
        logger.info("*** Finished social network ranking! ***");

        // MySQL connection setup
        String url = Config.MYSQL_HOST + ":" + Config.MYSQL_PORT + "/" + Config.MYSQL_DATABASE;

        String query = "INSERT INTO post_rankings (user_id, post_id, weight) VALUES (?, ?, ?, NOW()) "
            + "ON DUPLICATE KEY UPDATE weight = VALUES(weight)";

        try {
            Connection conn = DriverManager.getConnection(url, Config.MYSQL_USER, Config.MYSQL_PASSWORD);
            PreparedStatement statement = conn.prepareStatement(query);

            for (SerializablePair<String, SerializablePair<String, Double>> item : topPosts) {
                String userId = item.getLeft();
                String postId = item.getRight().getLeft().substring(5); // will be "post:[postId]" --> postId;
                double weight = item.getRight().getRight();

                statement.setString(1, userId);
                statement.setString(2, postId);
                statement.setDouble(3, weight);
                statement.addBatch();
            }
            statement.executeBatch();
            logger.info("Stored " + topPosts.size() + " items in post_rankings table");
        } catch (SQLException ex) {
            logger.info("error with sql"); 
            ex.printStackTrace();
        }
    }

}
