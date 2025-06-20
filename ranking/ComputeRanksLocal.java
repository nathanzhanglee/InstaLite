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
import java.sql.ResultSet;  // to read results
import java.sql.SQLException;

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
            d_max = 1;
            i_max = 15;
            debug = false;
        }

        FlexibleLogger rankLogger = new FlexibleLogger(LogManager.getLogger(SparkJob.class), true, debug);
        // No backlinks
        FeedRankJob job = new FeedRankJob(d_max, i_max, true, debug, rankLogger, config);

        List<SerializablePair<String, SerializablePair<String, Double>>> topPosts = job.mainLogic();
        logger.info("*** Finished social network ranking! ***");

        // MySQL connection setup
        String url = "jdbc:mysql://" + Config.MYSQL_HOST + ":" + Config.MYSQL_PORT + "/" + Config.MYSQL_DATABASE;

        String query = "INSERT INTO post_rankings (user_id, post_id, weight) VALUES (?, ?, ?) "
            + "ON DUPLICATE KEY UPDATE weight = VALUES(weight)";

        try {
            Connection conn = DriverManager.getConnection(url, Config.MYSQL_USER, Config.MYSQL_PASSWORD);
            PreparedStatement statement = conn.prepareStatement(query);

            for (SerializablePair<String, SerializablePair<String, Double>> item : topPosts) {
                logger.info("post item: " + item.getLeft() + "\t" + item.getRight().getLeft() + "\t" + item.getRight().getRight());
                int postId = Integer.parseInt(item.getRight().getLeft().substring(5));  // will be "post:[postId]" --> postId
                int userId = Integer.parseInt(item.getLeft());
                float weight = item.getRight().getRight().floatValue();

                statement.setInt(1, userId);
                statement.setInt(2, postId);
                statement.setFloat(3, weight);
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
