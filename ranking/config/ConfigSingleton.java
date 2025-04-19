package ranking.config;

import io.github.cdimascio.dotenv.Dotenv;

public class ConfigSingleton {
    public static Config config = null;    

    public static Config getInstance() {
        if (config != null)
            return config;

        config = new Config();
        Dotenv dotenv = Dotenv.configure().load();

        config.DATABASE_CONNECTION = "jdbc:mysql://" + dotenv.get("DATABASE_SERVER") + ":3306/" + dotenv.get("DATABASE_NAME");
        config.DATABASE_USERNAME = dotenv.get("DATABASE_USER");
        config.DATABASE_PASSWORD = dotenv.get("DATABASE_PASSWORD");
        config.CHROMA_CLIENT_PORT = dotenv.get("CHROMA_CLIENT_PORT", "8000");

        // Retrieve AWS credentials from environment variables
        config.ACCESS_KEY_ID = dotenv.get("ACCESS_KEY_ID");
        config.SECRET_ACCESS_KEY = dotenv.get("SECRET_ACCESS_KEY");
        config.SESSION_TOKEN = dotenv.get("SESSION_TOKEN");

        config.FIRST_N_ROWS = Integer.parseInt(dotenv.get("FIRST_N_ROWS", "10000"));

        config.SPARK_APP_NAME = dotenv.get("SPARK_APP_NAME", "IMDBRelations");
        config.SPARK_MASTER_URL = dotenv.get("SPARK_MASTER_URL", "local[*]");
        config.SPARK_DRIVER_MEMORY = dotenv.get("SPARK_DRIVER_MEMORY", "10g");
        config.SPARK_TESTING_MEMORY = dotenv.get("SPARK_TESTING_MEMORY", "2147480000");

        config.LIVY_HOST = dotenv.get("LIVY_HOST");
        return config;
    }
}