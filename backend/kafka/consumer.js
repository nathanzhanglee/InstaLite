import pkg from 'kafkajs';
const { Kafka, CompressionTypes, CompressionCodecs } = pkg;
import SnappyCodec from 'kafkajs-snappy';
import fs from 'fs';
import { createPost } from '../routes/routes';


CompressionCodecs[CompressionTypes.Snappy] = SnappyCodec;
const config = JSON.parse(fs.readFileSync('config/config.json', 'utf8'));

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
        console.log(`Received from ${topic}: `, postData);

        if (topic === 'Bluesky-Kafka') {
          const imageHash = postData.embed?.images?.[0]?.image?.ref?.link;
          const imageUrl = imageHash
            ? `https://cdn.bsky.app/img/feed_fullsize/${imageHash}`
            : null;
        
          const mockReq = {
            session : { user_id: 9999 }, 
            body: {
              title: "Bluesky Post",
              content: postData.text || "",
              parent_id: null
            },
            file: imageUrl
          };
        } else if (topic === 'FederatedPosts') {
            const mockReq = {
              session : { user_id: 9998 }, 
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

        const mockRes = {
          status: () => mockRes,
          json: (data) => console.log(`Created post from ${topic}: `, data)
        };
        await createPost(mockReq, mockRes);
      } catch (error) {
        console.error('ERROR: occured while creating post from Kafka');
      }
    },
  });
};