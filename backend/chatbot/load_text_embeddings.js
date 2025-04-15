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
  modelName: "text-embedding-ada-002"
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
    return null;
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
      n.primaryName as author \
    FROM posts p \
    JOIN users u on u.user_id = p.author_id \
    JOIN names n on n.nconst = u.linked_nconst \
  ';
  try {
    return await mysql_db.send_sql(query);
  } catch (err) {
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
      u.user_id AS user_id, \
      u.username AS username, \
      n1.primaryName as primaryName, \
      GROUP_CONCAT(n2.primaryName SEPARATOR ',') as follows \
    FROM users u \
    JOIN names n1 on n1.nconst = u.linked_nconst \
    JOIN friends f on f.follower = u.linked_nconst \
    JOIN names n2 on f.followed = n2.nconst \
    GROUP BY u.username, u.user_id, n1.primaryName \
  ";
  try {
    return await mysql_db.send_sql(query);
  } catch (err) {
    console.log("error getting user data from mysql", err);
  }
}

/**
 * Returns MySQL results about which movies an actor is in.
 * Also include information about each movie as "movie (info)"
 */
async function getActorData() {
  const limitQuery = "SET SESSION group_concat_max_len = 1000000;";
  await mysql_db.send_sql(limitQuery);

  const query = "\
    SELECT \
      n.nconst AS nconst, \
      n.primaryName AS primaryName, \
      n.birthYear AS birthYear, \
      n.deathYear AS deathYear, \
      GROUP_CONCAT( \
        CONCAT( \
          t.primaryTitle, ' (', \
          'as a ', p.category, ' for ', \
          IFNULL( TRIM( \
            LEADING '[\"' FROM( \
              TRIM( \
                TRAILING '\"]' FROM p.characters \
              ) \
            ) \
          ), 'N/A'), \
          ')' \
        ) SEPARATOR ' ; '\
      ) AS movies \
    FROM names n \
    JOIN principals p ON n.nconst = p.nconst \
    JOIN titles t on p.tconst = t.tconst \
    GROUP BY n.nconst \
  ";
  try {
    return await mysql_db.send_sql(query);
  } catch (err) {
    console.log("error getting user data from mysql", err);
  }
}

async function embedAndStoreMovies() {
  const mysql_db = get_db_connection();
  await mysql_db.connect();

  const chroma_db = ChromaDB();

  // Clear collection before creating it.
  await chroma_db.create_table(COLLECTION_NAME);

  // Embed posts
  var results = await getPostData(); // [{ post_id, title, content, author }, ...]
  const posts = results[0];
  for (var i = 0; i < posts.length; i++) {
    const post = posts[i]; // JSON object
    const text = `Post ${post.post_id}, titled ${post.title}. ${post.content}. Written by ${post.author}.`;
    const embedding = await embedText(text);
    const key = `post_${post.post_id}`; // for chromadb
    await chroma_db.put_item_into_table(COLLECTION_NAME, key, embedding, text);
  }

  // Embed followed-follower user data (TODO: use public info only)
  results = await getUserData();
  const users = results[0];
  for (var i = 0; i < users.length; i++) {
    const user = users[i]; // JSON object
    const text = `Name of ${user.username} is ${user.primaryName}, who follows ${user.follows}`;
    const embedding = await embedText(text);
    const key = `user_${user.user_id}`; // for chromadb
    await chroma_db.put_item_into_table(COLLECTION_NAME, key, embedding, text);
  }

  // Embed data about principals (actors, directors, writers) and their roles in movies.
  results = await getActorData();
  const actors = results[0];
  for (var i = 0; i < actors.length; i++) {
    const actor = actors[i]; // JSON object
    const text = JSON.stringify(actor);
    const embedding = await embedText(text);
    const key = `${actor.nconst}`; // for chromadb
    await chroma_db.put_item_into_table(COLLECTION_NAME, key, embedding, text);
  }

  console.log("Embeddings loaded into ChromaDB");
}

embedAndStoreMovies();