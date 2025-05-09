import pkg from 'kafkajs';
const { Kafka, CompressionTypes, CompressionCodecs } = pkg;
import SnappyCodec from 'kafkajs-snappy';
import fs from 'fs';
import { createBlueSkyPost, createFederatedPost } from '../routes/routes.js';


const config = JSON.parse(fs.readFileSync('config/config.json', 'utf8'));
CompressionCodecs[CompressionTypes.Snappy] = SnappyCodec;

const kafka = new Kafka({
  clientId: 'instakann-consumer',
  brokers: config.kafka.bootstrapServers,
});


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
            session : { user_id: 9999 }, 
            body: {
              title: "New Bluesky Post",
              content: postData.text || "",
              parent_id: null,
              username: 'BlueskyPost', 
              hashtags: JSON.stringify(hashtags)
            },
            file: imageUrl
          };
          createBlueSkyPost(mockReq, mockRes);
        } else if (topic === 'FederatedPosts') {
          const { username, post_uuid_within_site, post_text, content_type, attach } = postData;
          const words = post_text.split(' ').map(word => word.trim());
          const hashtags = words.filter(word => word.startsWith('#') && word.length > 1).map(word => word.slice(1));
          mockReq = {
            session: { user_id: 9998 },
            body: {
              title: "Federated Post",
              content: postData.post_text,
              parent_id: null,
              username: 'federatedPost',
              hashtags: JSON.stringify(hashtags) 
            },
            file: null
          };
          createFederatedPost(mockReq, mockRes);
        } else {
          console.error('ERROR: topic was neither Bluesky-Kafka or FederatedPosts');
        }
      } catch (error) {
        console.error('ERROR: occured while creating post from Kafka', error);
      }
    },
  });
};