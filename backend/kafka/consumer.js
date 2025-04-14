import pkg from 'kafkajs';
const { Kafka, CompressionTypes, CompressionCodecs } = pkg;
import SnappyCodec from 'kafkajs-snappy';
import fs from 'fs';

CompressionCodecs[CompressionTypes.Snappy] = SnappyCodec;
const config = JSON.parse(fs.readFileSync('config/config.json', 'utf8'));

const kafka = new Kafka({
  clientId: 'my-app',
  brokers: config.kafka.bootstrapServers,
});

const consumer = kafka.consumer({ groupId: config.kafka.groupId });

export const runConsumer = async () => {
  await consumer.connect();
  await consumer.subscribe({ topic: config.kafka.topic, fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      console.log(`Received: ${message.value.toString()}`);
    },
  });
};