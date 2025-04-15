import { runConsumer } from '../../kafka/consumer.js';
import { sendFederatedPost } from '../../kafka/producer.js';

// Test post data
const testPost = {
  post_text: "HELLO",
  author: "cool team",
  timestamp: new Date().toISOString()
};

// Run the test
async function testFederatedPostFlow() {
  try {
    // Start consumer 
    console.log("Starting consumer...");
    runConsumer().catch(console.error);
    
    // Alloting time for consumer to connect
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Send test post
    console.log("Sending test post...");
    await sendFederatedPost(testPost);
    
    console.log("Test completed. Check console for consumer output.");
  } catch (error) {
    console.error("Test failed:", error);
  }
}

testFederatedPostFlow();

// Console should log post format of consumer reading new post
