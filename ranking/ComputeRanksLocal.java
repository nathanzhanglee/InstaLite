package edu.upenn.cis.nets2120.hw3.local;

import edu.upenn.cis.nets2120.config.Config;
import edu.upenn.cis.nets2120.config.ConfigSingleton;
import edu.upenn.cis.nets2120.hw3.spark.SocialRankJob;
import edu.upenn.cis.nets2120.hw3.utils.SerializablePair;

import edu.upenn.cis.nets2120.hw3.utils.FlexibleLogger;
import edu.upenn.cis.nets2120.spark.SparkJob;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.io.FileOutputStream;
import java.io.PrintStream;
import java.util.*;

import javax.security.auth.login.ConfigurationSpi;

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
            i_max = 25;
            debug = false;
        }

        FlexibleLogger rankLogger = new FlexibleLogger(LogManager.getLogger(SparkJob.class), true, debug);
        // No backlinks
        SocialRankJob job = new SocialRankJob(d_max, i_max, Config.FIRST_N_ROWS, false, true, debug, rankLogger, config);

        List<SerializablePair<String, Double>> topK = job.mainLogic();
        logger.info("*** Finished social network ranking! ***");

        try (PrintStream out = new PrintStream(new FileOutputStream("socialrank-local.csv"))) {
            for (SerializablePair<String, Double> item : topK) {
                out.println(item.getLeft() + "," + item.getRight());
                logger.info(item.getLeft() + " " + item.getRight());
            }
        } catch (Exception e) {
            logger.error("Error writing to file: " + e.getMessage());
        }
    }

}
