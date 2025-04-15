import pkg from 'kafkajs';
const { Kafka } = pkg;
import fs from 'fs';


const config = JSON.parse(fs.readFileSync('config/config.json', 'utf8'));

const kafka = new Kafka({
  clientId: 'instakann-producer',
  brokers: config.kafka.bootstrapServers,
});

const producer = kafka.producer();

export const sendFederatedPost = async (postData) => {
  await producer.connect();
  try {
    await producer.send({
      topic: 'FederatedPosts',
      messages: [
        {
          value: JSON.stringify(postData),
        },
      ],
    });
    console.log('Federated post sent to Kafka');
  } catch (error) {
    console.error('Error sending federated post:', error);
  } finally {
    await producer.disconnect();
  }
};