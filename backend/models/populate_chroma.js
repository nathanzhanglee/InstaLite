/**
 * This script populates ChromaDB with embeddings for items from a CSV file.
 * Note that as faces are not guaranteed to be recognized, embeddings for all
 * actors/actresses in each image are not guaranteed.
 * 
 * By default, it will overwrite any database with that name, or create a new one if it doesn't exist.
 * When passing in --soft, it will only populate if the chroma database is empty. */

import ChromaDB from './vector.js';
import fs from 'fs';
import S3KeyValueStore from './s3.js';
import {get_db_connection} from './rdbms.js';
import FaceEmbed from './face_embed.js';

// Simple approach to determine config file path
const configPath = fs.existsSync('./config/config.json') 
  ? './config/config.json'           // Running from backend folder
  : 'backend/config/config.json';    // Running from root folder
const configFile = fs.readFileSync(configPath, 'utf8');
const config = JSON.parse(configFile);

const chroma = new ChromaDB();
const s3 = new S3KeyValueStore("nets2120-images", "default"); //to read in the images
const sql_db = get_db_connection();
const face = new FaceEmbed(config.faceEmbedModelPath);

const args = process.argv.slice(2);
const soft = args.includes('--soft');
const fullLoad = args.includes('--full');

async function getEmbedding(id, fileName) {
  if (fileName.startsWith('imdb_crop/')) {
    fileName = fileName.replace('imdb_crop/', '');
  }
  const file_obj = await s3.fetchFileBinary(fileName);
  const embeddings = await face.getEmbeddingsFromBuffer(file_obj);
  return embeddings[0];
}

async function populate_chroma() {
  const data = fs.readFileSync('merged_imdb_data.csv', 'utf8');
  const rows = data.split('\n');
  let count = 0;
  let headerSeen = false;

  const chromaClient = await chroma.get_client();
  const collectionName = config.chromaDbName;

  try {
    const collection = await chromaClient.getCollection({name: collectionName});
    const collectionCount = await collection.count();
    if (collectionCount > 0) {
      if (soft) {
        console.log(`Collection ${collectionName} already exists and is not empty.`);
        console.log("Run without --soft option to overwrite. Exiting.");
        return 0;
      } else {
        console.log(`Re-creating collection ${collectionName}...`);
        await chromaClient.deleteCollection({name: collectionName});
        await chromaClient.createCollection({name: collectionName});
      }
    }
  } catch (error) {
    if (error.name === 'InvalidCollectionError') {
      console.log(`Collection ${collectionName} not found. Creating new collection...`);
      await chromaClient.createCollection({name: collectionName});
    } else {
      console.log(`Error accessing collection: ${error.message}`);
      return 0;
    }
  }

  for (const row of rows) {
    if (!headerSeen) {
      headerSeen = true;
      //skips the header row
      continue;
    }


    const tokens = row.split(',');
    const row_id = tokens[0];
    let image_url = tokens[5];
    const autoEmbedding = await getEmbedding(row_id, image_url);

    if (!autoEmbedding || !autoEmbedding.length) {
      console.log(`No embedding for item ${row_id} found, skipping...`);
      continue;
    }

    console.log("embedding:",autoEmbedding);
    count++;
    await chroma.put_item_into_table(config.chromaDbName, row_id, autoEmbedding, row);

    const death_year = tokens[4] === '""' ? null : parseInt(tokens[4]);

    await sql_db.connect();
    await sql_db.send_sql("INSERT IGNORE INTO names(nconst, primaryName, birthYear, deathYear) VALUES (?, ?, ?, ?)", 
      [tokens[1], tokens[2], parseInt(tokens[3]), death_year]
    );

    if (!fullLoad && count > config.max) {
      console.log(`Embedded max count of ${config.max}, stopping...`);
      break;
    }
  }
  console.log('finished adding rows to vector store');
  return count;
}

await face.loadModel();
await populate_chroma();
process.exit(0);