package instalite.ranking.config;

/**
 * Global configuration for NETS 2120 homeworks.
 *
 * @author zives
 */
public class Config {
    // For test drivers
    public static void setSocialPath(String path) {
        SOCIAL_NET_PATH = path;
    }

    /**
     * The path to the space-delimited social network data
     */
    public static String SOCIAL_NET_PATH = "s3a://nets2120-images/movie_friends.txt";

    public static String LOCAL_SPARK = "local[*]";

    public static String JAR = "target/instalite-0.0.1-SNAPSHOT.jar";

    public static String DATABASE_CONNECTION = null;
    public static String DATABASE_USERNAME = null;
    public static String DATABASE_PASSWORD = null;
    public static String CHROMA_CLIENT_PORT = null;

    public static String SPARK_APP_NAME = "IMDBRelations";
    public static String SPARK_MASTER_URL = "local[*]";
    public static String SPARK_DRIVER_MEMORY = "10g";
    public static String SPARK_TESTING_MEMORY = "2147480000";

    // Used for Spark to connect to Amazon RDS and pull data from the databases.
    public static String MYSQL_HOST = "localhost"; // change to rds link: your-db-name.abcdefghijk.us-west-2.rds.amazonaws.com
    public static String MYSQL_PORT = "3306";
    /* rds
    public static String MYSQL_USER = "admin1"; // nets2120_hw (local) or admin1 (RDS)
    public static String MYSQL_DATABASE = "instalite"; // imdb_basic (local) or instalite (RDS)
    public static String MYSQL_PASSWORD = "password,"; // S25AgH15 (local) or password (RDS)
    public static final String JDBC_DRIVER = "com.mysql.cj.jdbc.Driver";
    */
    public static String MYSQL_USER = "admin"; // nets2120_hw2 (local) or admin1 (RDS)
    public static String MYSQL_DATABASE = "instalite"; // imdb_basic (local) or instalite (RDS)
    public static String MYSQL_PASSWORD = "80w9b243UBA*Xv!UnXSA%is"; // S25AgH15, (local) or password (RDS),
    public static final String JDBC_DRIVER = "com.mysql.cj.jdbc.Driver";

    public static Integer FIRST_N_ROWS = 1000;

    // these are for EMR (Livy)
    public static String ACCESS_KEY_ID = "ASIAS36QOXPFGSIWMP4W";
    public static String SECRET_ACCESS_KEY = "hA74V4PKnm8HTfZKpzLgtLnrOCDOyaVr9cfeNW+F";
    public static String SESSION_TOKEN = "IQoJb3JpZ2luX2VjEIz//////////wEaCXVzLXdlc3QtMiJGMEQCIGGlzfhDHfb9Hj44fUKRNrx28mP36wWPFJyhWxwfeQ4XAiAG2t+9xYsnkyIRNfpw5p2d4Ghl1a/hZOcfwe2WFFX6HCqyAgg0EAEaDDE5NzQ2ODc5Nzg5OCIMKFsBHc4CvdSYCjfrKo8CmH/VTgHQTBm1DvLezEqDCgyR7RBJskJwMOJ0oEjsGll+zi9Ye6UTbYL7eRFmbxE0kGn7PDgwq0Swu/3XFmTHvhbYB5lqsLBONYj+8oWHbc8J6NRTHir4Hu4V4fLQjPWVky3QCE9tn+Drx0tdyJIITofvSzJdZHMlBnHfQv3S+ssJd6Lc0qDwG/tjoROItTsRMvLSyNGvkEHEtgBD3VaJXEdPNe5U68KUcJ9jmJBBAN85v+SqSesdKbiZa2/IomQyXj/8MLpRdQcWPG/o8ye+Y4cDjv36lEUMhHC6ueK7wmxv3OaxguLZPjTC7QPtGQbnvHtD3i7xI9w5VAPfeHBOu+rnLsH5UdHrkhJjiINo8DC7nuTABjqeAU3EbgFs/TbbwM+tFpmcT5iJ2F69R+hh0YACi0skVQxYLwskb8+R1+e5lNI2NmCmb+mlHYmu5oPXkVYn0F9lTJGb6DIBD3uYEm4nvx0UG33mZbrvjy+PecgeVmwGV36UiPNZXDAoX0CypsoXO65ZrDtxLb6uY8SuqpSmcXpJ5Ot1KeeU+g4udEHAQGdLjrmKfTPubS4b1fMPkLp3jhn9";

    public static String LIVY_HOST = "localhost";

    /**
     * How many RDD partitions to use?
     */
    public static int PARTITIONS = 5;
}