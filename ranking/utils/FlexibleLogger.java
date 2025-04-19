package spark.utils;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

public class FlexibleLogger {
    Logger logger = null;
    boolean useStdOutErr;
    boolean debug;

    public FlexibleLogger(Logger logger, boolean useStdOutErr, boolean debug) {
        this.useStdOutErr = useStdOutErr;
        this.debug = debug;
        this.logger = logger;
        if (logger == null) {
            this.useStdOutErr = true;
        }
    }

    public void error(String message) {
        if (useStdOutErr) {
            System.err.println(message);
        } else
            logger.error(message);
    }

    public void info(String message) {
        if (useStdOutErr) {
            System.out.println(message);
        } else
            logger.info(message);
    }

    public void debug(String message) {
        if (debug) {
            if (useStdOutErr) {
                System.out.println(message);
            } else
                logger.debug(message);
        }
    }
}
