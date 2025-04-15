import { runConsumer } from '../../kafka/consumer.js'; 
runConsumer().catch(console.error);

// Console should log with all Bluesky Posts read from topic in post format
