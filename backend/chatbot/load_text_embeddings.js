import { OpenAIEmbeddings } from "@langchain/openai";
import { get_db_connection } from "../models/rdbms.js";
import ChromaDB from "../models/vector.js";
import fs from 'fs';

const configFile = fs.readFileSync('./backend/config/config.json', 'utf8');
const config = JSON.parse(configFile);

// Database connections
const mysql_db = get_db_connection();
await mysql_db.connect();
const chroma_db = ChromaDB();

const embeddings = new OpenAIEmbeddings({
  modelName: "text-embedding-3-small",
  openAIApiKey: config.openaiApiKey
});

const COLLECTION_NAME = "text_embeddings";

// Cut off some text in case it's too long for OpenAI embedding.
function shortenText(text, maxTokens = 8192) {
  // Allow for 3 chars per token on average.
  const maxLength = maxTokens * 3;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

// Returns OpenAI embedding of paragraph
async function embedText(paragraph) {
  try {
    const result = await embeddings.embedQuery(shortenText(paragraph));
    return result;
  } catch (error) {
    console.error("Error embedding paragraph:", error);
    throw new Error(`Failed to embed text: ${error.message}`);
  }
}

/**
 * Returns MySQL query results in JSON, where each string
 * contains post_id, title, content, and author name.
 */
async function getPostData() {
  const query = '\
    SELECT \
      p.post_id AS post_id, \
      p.title AS title, \
      p.content AS content, \
      p.author_username as author \
    FROM posts p';
  try {
    return await mysql_db.send_sql(query);
  } catch (err) {
    console.log("ERROR:", err);
    console.log("error getting post data from mysql");
  }
}

/**
 * Returns MySQL query results, where each string contains
 * a username, their real name, and the people they follow.
 */
async function getUserData() {
  const query = "\
    SELECT \
      u1.user_id AS user_id, \
      u1.username AS username, \
      u1.first_name as first_name, \
      u1.last_name as last_name, \
      GROUP_CONCAT(u2.username SEPARATOR ',') as follows \
    FROM users u1 \
    JOIN friends f on f.follower = u1.user_id \
    JOIN users u2 on f.followed = u2.user_id \
    GROUP BY u1.username, u1.user_id \
  ";
  try {
    return await mysql_db.send_sql(query);
  } catch (err) {
    console.log("ERROR:", err);
    console.log("error getting user data from mysql", err);
  }
}

async function embedAndStoreMovies() {
  
  // Clear collection before creating it.
  await chroma_db.create_table(COLLECTION_NAME);
  
  // Embed posts
  var results = await getPostData(); // [{ post_id, title, content, author }, ...]
  const posts = results[0];
  for (var i = 0; i < posts.length; i++) {
    const post = posts[i]; // JSON object
    const text = `Post ${post.post_id}, titled ${post.title}. ${post.content}. Written by ${post.author_username}.`;
    const embedding = await embedText(text);
    console.log(text);
    const key = `post_${post.post_id}`; // for chromadb
    await chroma_db.put_item_into_table(COLLECTION_NAME, key, embedding, text);
  }

  // Embed followed-follower user data
  results = await getUserData();
  const users = results[0];
  for (var i = 0; i < users.length; i++) {
    const user = users[i]; // JSON object
    const text = `Name of ${user.username} is ${user.first_name + ' ' + user.last_name}, who follows ${user.follows}`;
    const embedding = await embedText(text);
    const key = `user_${user.user_id}`; // for chromadb
    await chroma_db.put_item_into_table(COLLECTION_NAME, key, embedding, text);
  }
  
  console.log("Embeddings loaded into ChromaDB");
}

await embedAndStoreMovies();
process.exit(0);