package instalite.ranking.spark;

import java.io.File;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.apache.spark.api.java.JavaSparkContext;
import org.apache.spark.sql.SparkSession;
import org.apache.spark.sql.SparkSession.Builder;

import com.amazonaws.auth.profile.ProfileCredentialsProvider;

import instalite.ranking.config.Config;

public class SparkConnector {
    /**
     * The basic logger
     */
    static Logger logger = LogManager.getLogger(SparkConnector.class);
    static SparkSession spark = null;
    static JavaSparkContext context = null;

    // Setters for testing - mock objects
    public static void setSparkSession(SparkSession s) {
        spark = s;
    }

    // Setters for testing - mock objects
    public static void setSparkContext(JavaSparkContext c) {
        context = c;
    }

    public static SparkSession getSparkConnection(Config config) {
        return getSparkConnection(null, config);
    }

    public static synchronized SparkSession getSparkConnection(String host, Config config) {
        if (spark == null) {
            if (System.getenv("HADOOP_HOME") == null) {
                File workaround = new File(".");

                System.setProperty("hadoop.home.dir", workaround.getAbsolutePath() + "/native-libs");
            }

            if (config.ACCESS_KEY_ID != null) {
                logger.info("Credentials were provided, using S3");
                SparkSession.Builder sparkBuilder = SparkSession
                    .builder()
                    .appName("Homework3")
                    .master((host == null) ? config.LOCAL_SPARK : host)
                    .config("spark.hadoop.fs.s3a.access.key", config.ACCESS_KEY_ID)
                    .config("spark.hadoop.fs.s3a.secret.key", config.SECRET_ACCESS_KEY);
                if (config.SESSION_TOKEN != null)
                    sparkBuilder = sparkBuilder.config("spark.hadoop.fs.s3a.session.token", config.SESSION_TOKEN);

                spark = sparkBuilder
                    .config("spark.hadoop.fs.s3a.endpoint", "s3.us-east-1.amazonaws.com")
                    .getOrCreate();
        } else {
                logger.info("Credentials were not provided in .env: using AWS profile credentials");
                spark = SparkSession
                        .builder()
                        .appName("Homework3")
                        .master((host == null) ? config.LOCAL_SPARK : host)
                        .config("spark.hadoop.fs.s3a.aws.credentials.provider", "com.amazonaws.auth.profile.ProfileCredentialsProvider")
                        .config("spark.hadoop.fs.s3a.aws.credentials.profile.name", "default")
                        .getOrCreate();
            }
        }

        return spark;
    }

    public static synchronized JavaSparkContext getSparkContext(Config config) {
        if (context == null)
            context = new JavaSparkContext(getSparkConnection(config).sparkContext());

        return context;
    }
}
