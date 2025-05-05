import pkg from 'kafkajs';
const { Kafka, CompressionTypes, CompressionCodecs } = pkg;
import SnappyCodec from 'kafkajs-snappy';
import fs from 'fs';
import { createExternalPost } from '../routes/routes.js';

const config = JSON.parse(fs.readFileSync('config/config.json', 'utf8'));
CompressionCodecs[CompressionTypes.Snappy] = SnappyCodec;

const kafka = new Kafka({
  clientId: 'instakann-consumer',
  brokers: config.kafka.bootstrapServers,
});

function generateMockUserId() {
  return -Math.floor(Math.random() * 1000000);
}

const consumer = kafka.consumer({ groupId: config.kafka.groupId });

export const runConsumer = async () => {
  await consumer.connect();
  await consumer.subscribe(
    { topics: ['FederatedPosts', 'Bluesky-Kafka'],
       fromBeginning: true 
      });
  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      try {
        const postData = JSON.parse(message.value.toString());
        // logging raw data from kafka:
        // console.log(`Received from ${topic}: `, postData); 
        let mockReq, mockRes = {};

        mockRes.status = () => mockRes;
        mockRes.json = (data) => console.log(`Created post from ${topic}: `, data);

        if (topic === 'Bluesky-Kafka') {
          const imageHash = postData.embed?.images?.[0]?.image?.ref?.link;
          const imageUrl = imageHash
            ? `https://cdn.bsky.app/img/feed_fullsize/${imageHash}`
            : null;
          const words = postData.text.split(' ').map(word => word.trim());
          const hashtags = words.filter(word => word.startsWith('#') && word.length > 1).map(word => word.slice(1));
          mockReq = {
            session : { user_id: generateMockUserId() }, 
            body: {
              title: "Bluesky Post",
              content: postData.text || "",
              parent_id: null
            },
            file: imageUrl
          };
          await createExternalPost(mockReq, mockRes);
        } else if (topic === 'FederatedPosts') {
          const { username, post_uuid_within_site, post_text, content_type, attach } = postData;
          const words = post_text.split(' ').map(word => word.trim());
          const hashtags = words.filter(word => word.startsWith('#') && word.length > 1).map(word => word.slice(1));
            mockReq = {
              session : { user_id: generateMockUserId() }, 
              body: {
                title: "Federated Post",
                content: postData.post_text,
                parent_id: null
              },
              file: null 
            };
        } else {
          console.error('ERROR: topic was neither Bluesky-Kafka or FederatedPosts');
        }

        // if ((postDoesNotAlreadyExists)) { // Don't want to create posts from posts we sent!
        //   await createExternalPost(mockReq, mockRes);
        // }

      } catch (error) {
        console.error('ERROR: occured while creating post from Kafka');
      }
    },
  });
};