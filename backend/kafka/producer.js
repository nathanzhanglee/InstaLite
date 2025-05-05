import pkg from 'kafkajs';
const { Kafka } = pkg;
import fs from 'fs';
import { configDotenv } from 'dotenv';

// Simple approach to determine config file path
const configPath = fs.existsSync('./config/config.json') 
  ? './config/config.json'           // Running from backend folder
  : 'backend/config/config.json';    // Running from root folder
const configFile = fs.readFileSync(configPath, 'utf8');
const config = JSON.parse(configFile, 'utf8');

configDotenv({path: "../.env"})

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