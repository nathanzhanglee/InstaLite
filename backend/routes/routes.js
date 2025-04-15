import {get_db_connection} from '../models/rdbms.js';
import ChromaDB from '../models/vector.js';
import S3 from '../models/s3.js';
import FaceEmbed from '../models/face_embed.js';
import {v4 as uuidv4} from 'uuid';
import bcrypt from 'bcrypt';
import fs from 'fs';

// hw4 langchain imports
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { OpenAIEmbeddings } from "@langchain/openai";
import { formatDocumentsAsString } from "langchain/util/document";
import { RunnableSequence, RunnablePassthrough } from "@langchain/core/runnables";
import { Chroma } from "@langchain/community/vectorstores/chroma";

//kafka send post function
import { sendFederatedPost } from '../kafka/producer.js';


const configFile = fs.readFileSync('backend/config/config.json', 'utf8');
const config = JSON.parse(configFile);

// establish connections and initialize
const mysql_db = get_db_connection();
const chroma_db = ChromaDB();
const s3_db = new S3(config.s3BucketName);
const face = new FaceEmbed();
var vectorStore = null;
const message_page_size = config.socialParams.messagePageSize;

/**
 * A helper function to upload files to S3
 * @param {Object} file - The file object from multer
 * @param {String} filePrefix - The prefix/virtual directory for the file name in S3
 * @returns The S3 path of the uploaded file
 */
async function uploadToS3(file, filePrefix) {
  const fileExtension = file.originalname.split('.').pop(); //gets the file extension by splitting by . and taking last element
  const fileName = `${filePrefix}/${Date.now()}-${uuidv4()}.${fileExtension}`; //scalability: use uuid + time to avoid name collisions

  const s3_path = await s3_db.uploadBuffer(file.buffer, fileName, file.mimetype);
  return {path: s3_path, type: file.mimetype};
}

/**
 * 
 * @param {String} filepath the path to the file in S3
 * @returns the embedding of the image at the given filepath
 */
async function getEmbeddingFromPath(filepath) {
  let key = filepath.split('.com/')[1];
  const buffer = await s3_db.fetchFileBinary(key);
  const embeddings = await face.getEmbeddingsFromBuffer(buffer);
  return embeddings[0];
}

async function getVectorStore() {
  if (vectorStore == null) {
      vectorStore = await Chroma.fromExistingCollection(new OpenAIEmbeddings(), {
          collectionName: "imdb_reviews2",
          url: "http://localhost:8000", // Optional, will default to this value
          });
  } else
      console.log('Vector store already initialized');
  return vectorStore;
}


async function querySQLDatabase(query, params = []) {
  await mysql_db.connect();

  return mysql_db.send_sql(query, params);
}

async function registerUser(req, res) {
  //initialize variables from request
  const username = req.body.username;
  const email = req.body.email;
  const first_name = req.body.fname;
  const last_name = req.body.lname;
  const password = req.body.password;
  const birthday = req.body.birthday;   
  const affiliation = req.body.affiliation;

  //think about how bday would be passed in: let's assume YYYY-MM-DD because that's how SQL wants it
  //validate birthday here
  if (!(birthday instanceof Date) && (typeof birthday !== 'string' || !birthday.match(/^\d{4}-\d{2}-\d{2}$/))) {
    console.log(`Invalid birthday format\n birthday: ${birthday}\n`);
    return res.status(400).json({ error: 'Invalid birthday format' });
  }

  if ([username, email, first_name, last_name, password, birthday, affiliation].some(field => field === undefined)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const usernameMatches = await querySQLDatabase(`SELECT COUNT(*) AS ucount FROM users WHERE username = ?`, [username]);

  if (usernameMatches[0].ucount > 0) {
    return res.status(400).json({ error: 'Username already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const sql = 'INSERT INTO users (username, email, first_name, last_name, birthday, affiliation, hashed_password) VALUES (?, ?, ?, ?, ?, ?, ?)';
  const params = [username, email, first_name, last_name, birthday, affiliation, hashedPassword];

  try {
    await querySQLDatabase(sql, params);
    const user_id = (await querySQLDatabase('SELECT user_id FROM users WHERE username = ?', [username]))[0].user_id;

    req.session.user_id = user_id;  //set session id
    return res.status(201).json({ message: `User ${username} registered successfully`});
  } catch (error) {
    console.error(`Error registering user ${username}:`, error);
    return res.status(500).json({error: 'Internal server error'});
  }
}

async function registerProfilePicture(req, res) {
  const userId = req.session.user_id;   //may eventually update with security in mind
  if (!userId) {
    res.status(403).json({error: 'Not logged in.'});
  }

  const profilePic = req.file; // multer stores the binary file in req.file

  if (!profilePic) {
    return res.status(400).json({ error: 'No profile picture uploaded' });
  }

  const s3_path = await uploadToS3(profilePic, "profile-pics").path;

  const sql = 'UPDATE users SET profile_pic_link = ? WHERE user_id = ?';
  const params = [s3_path, userId];

  try {
    await querySQLDatabase(sql, params);
  } catch (error) {
    console.error(`Error updating profile picture for user ${userId}:`, error);
    return res.status(500).json({ error: 'Internal server error' });
  }

  let top_matches;
  try {
    const embedding = await getEmbeddingFromPath(s3_path);
    top_matches = await chroma_db.get_items_from_table(config.chromaDbName, embedding, 5);
  } catch (error) {
    console.error(`Error getting top matches for user ${userId}:`, error);
    return res.status(500).json({error: 'Internal server error'});
  }
  console.log("Top chroma matches: ",top_matches);
  return res.status(200).json({ message: 'Profile picture added successfully', top_matches });
}

// POST /login
async function postLogin(req, res) {
  console.log(req.body);
  var username = req.body.username;
  var plain_password = req.body.password;
  if (!username || !plain_password) {
      return res.status(400).json({error: 'One or more of the fields you entered was empty, please try again.'});
  }
  let results;
  console.log('Logging in user: ' + username);

  // check if user exists then match password. If appropriate, set session
  try {
      results = (await querySQLDatabase("SELECT user_id, hashed_password FROM users WHERE username = ?;", [username]))[0];  //remove the format thing
      console.log(results);
  } catch (err) {
      return res.status(500).json({error: 'Error querying database'});
  }
  
  if (results.length > 0) {
      console.log("FIRST ELEMENT of results: ",results[0]);
      bcrypt.compare(plain_password, results[0].hashed_password, (err, success) => {
          if (err) {
              console.log("BCRYPT ERROR:",err);
          } else {
              if (success) {
                  req.session.user_id = results[0].user_id;    // set session id for successful login
                  res.status(200).json({username: username});
              } else {
                  res.status(401).json({error: 'Username and/or password are invalid.'});
              }
          }
      });
  } else {
      res.status(401).json({error: 'Username and/or password are invalid.'});
  }
};


// POST /logout
async function postLogout(req, res) {
    await querySQLDatabase("UPDATE users SET last_online = CURRENT_TIMESTAMP WHERE user_id = ?", [req.session.user_id]); 
    //update last_online timestamp
    req.session.user_id = null;
    return res.status(200).json({message: "You were successfully logged out."});
};


// GET /friends
async function getFriends(req, res) {    
    if (!req.session.user_id) {
        return res.status(403).json({error: 'Not logged in.'});
    }
    const currId = req.session.user_id;
    let results;
    console.log('Getting friends for ' + currId);
    // find where the user is a FOLLOWER, take the followed's username (bidirectional edges means this choice ensures uniqueness)
    try {
        results = (await querySQLDatabase("SELECT u_followed.username FROM users AS u_follower JOIN friends AS f ON \
          u_follower.user_id = f.follower JOIN users AS u_followed ON u_followed.user_id = f.followed \
          WHERE u_follower.user_id = ?;", [currId]))[0]; //remove the schema thing
        return res.status(200).json(results);
    } catch (err) {
        console.log("ERROR in getFriends query:",err);
        return res.status(500).json({error: 'Error querying database'});
    }
}

async function postAddFriend(req, res) {
  const userId = req.session.user_id;
  if (!userId) {
    return res.status(403).json({error: 'Not logged in.'});
  }
  
  const friendUsername = req.body.friendUsername;

  if (!friendUsername) {
    return res.status(400).json({error: 'Missing friend username'});
  }

  let friendId;
  try {
    const results = (await querySQLDatabase("SELECT user_id FROM users WHERE username = ?", [friendUsername]))[0];  
    //[0] limits to just returned results (removes schema)
    if (results.length === 0) {
      return res.status(404).json({error: 'User not found'});
    }
    friendId = results[0].user_id; // [0] gets first result
  } catch (err) {
    console.log("ERROR in addFriend query:", err);
    return res.status(500).json({error: 'Error querying database'});
  }
  try {
    // Check if they are already friends - will be stored as TWO rows (both directions) in the table
    const existingFriendship = await querySQLDatabase(
      "SELECT COUNT(*) AS count FROM friends WHERE (follower = ? AND followed = ?)",
      [userId, friendId, friendId, userId]
    );

    if (existingFriendship[0].count > 0) {
      return res.status(400).json({ error: 'You are already friends with this user' });
    }

    // Insert bidirectional friendship
    await querySQLDatabase("INSERT INTO friends (follower, followed) VALUES (?, ?), (?, ?)", [
      userId, friendId, friendId, userId
    ]);

    return res.status(201).json({ message: 'Friendship created successfully', friendUsername });
  } catch (err) {
    console.log("ERROR in addFriend insertion:", err);
    return res.status(500).json({ error: 'Error querying database' });
  }
}

async function postRemoveFriend(req, res) {
  const userId = req.session.user_id;
  if (!userId) {
    return res.status(403).json({ error: 'Not logged in.' });
  }

  const friendUsername = req.body.friendUsername;

  if (!friendUsername) {
    return res.status(400).json({ error: 'Missing friend username' });
  }

  let friendId;
  try {
    const results = await querySQLDatabase("SELECT user_id FROM users WHERE username = ?", [friendUsername]);
    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    friendId = results[0].user_id;
  } catch (err) {
    console.log("ERROR in removeFriend query:", err);
    return res.status(500).json({ error: 'Error querying database' });
  }

  try {
    // Check if they are actually friends
    const existingFriendship = (await querySQLDatabase(
      "SELECT COUNT(*) AS count FROM friends WHERE (follower = ? AND followed = ?) OR (follower = ? AND followed = ?)",
      [userId, friendId, friendId, userId]
    ))[0];
    console.log("EXISTING FRIENDSHIP RESULT: ", existingFriendship);
    if (existingFriendship[0].count === 0) {
      return res.status(400).json({ error: 'You are not currently friends with this user' });
    }

    // Remove bidirectional friendship
    await querySQLDatabase(
      "DELETE FROM friends WHERE (follower = ? AND followed = ?) OR (follower = ? AND followed = ?)",
      [userId, friendId, friendId, userId]
    );

    return res.status(200).json({ message: 'Friendship removed successfully', friendUsername });
  } catch (err) {
    console.log("ERROR in removeFriend deletion:", err);
    return res.status(500).json({ error: 'Error querying database' });
  }
}

/**
 * Finds a chat ID with exactly the specified users as active members.
 * @param {Array<number>} usernames - Array of usernames to check
 * @returns - chat_id if an exact match is found, null otherwise
 */
async function findChat(usernames) {
  if (!usernames || usernames.length === 0) {
    return null;
  }
  
  const userCount = usernames.length;
  
  try {
    // Create placeholders for the IN clause, by marking the appropriate number of question marks
    const placeholders = usernames.map(() => '?').join(',');
    
    // This query uses JOINs and set-based logic rather than subqueries
    const sql = `
      SELECT active_members.chat_id
      FROM (
        -- First, find chats where all our users are active members
        SELECT chat_id 
        FROM chat_members
        WHERE user_id IN (${placeholders}) AND left_at IS NULL
        GROUP BY chat_id
        HAVING COUNT(DISTINCT user_id) = ?
      ) AS candidate_chats
      JOIN (
        -- Then, count the total number of active members in each chat
        SELECT chat_id, COUNT(*) AS total_members
        FROM chat_members
        WHERE left_at IS NULL
        GROUP BY chat_id
      ) AS active_members ON candidate_chats.chat_id = active_members.chat_id
      -- Only return chats where the total count matches our user count
      WHERE active_members.total_members = ?
      LIMIT 1
    `;
    
    const params = [...usernames, userCount, userCount];
    const results = (await querySQLDatabase(sql, params))[0];
    
    if (results?.length > 0) {
      return results[0].chat_id;
    }
    
    return null;
  } catch (err) {
    console.error("Error finding chat with JOIN-based query:", err);
    throw err;
  }
}

/**
 * Given a list of usernames in request, creates a new chat if one doesn't already exist,
 * or gets the chat that does exist containing those users.
 * 
 * @returns an object containing the chat_id and a boolean indicating if the chat was newly created
 */

async function createOrGetChat(req, res) {
  const userId = req.session.user_id;
  if (!userId) {
    return res.status(403).json({ error: 'Not logged in.' });
  }

  const usernames = req.body.usernames;

  if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
    return res.status(400).json({ error: 'Invalid, missing, or empty usernames array' });
  }


  try {
  // First, ensure uniqueness of usernames
  const username = (await querySQLDatabase("SELECT username FROM users WHERE user_id = ?", [userId]))[0][0].username;
  usernames.push(username); // Add the current user's username to the list, if it's not already there

  const uniqueUsernames = [...new Set(usernames)];

  // Check if a chat with these exact members already exists
  const existingChatId = await findChat(uniqueUsernames);
  if (existingChatId) {
    return res.status(200).json({ chat_id: existingChatId, created : false });
  }

  // Filter out the creator (current user) from the array to avoid duplicate add later
  const otherUsernames = uniqueUsernames.filter(name => name !== username);

  // Create a new chat with the current user
  const newChatResult = await querySQLDatabase("INSERT INTO chat_members (user_id) VALUES (?)", [userId]);
  const newChatId = newChatResult[0].insertId;

  // Add the remaining users to the chat (if any)
  if (otherUsernames.length > 0) {
    // First get all the user IDs for the usernames
    const userIdQuery = await querySQLDatabase(
      `SELECT user_id FROM users WHERE username IN (${otherUsernames.map(() => '?').join(',')})`,
      otherUsernames
    );
  
    const otherUserIds = userIdQuery[0].map(row => row.user_id);

    // Create parameter placeholders for the SQL query
    const placeholders = otherUserIds.map(() => '(?,?)').join(',');
    
    // Create flattened array of values
    const values = [];
    for (const uid of otherUserIds) {
      values.push(newChatId, uid);
    }
    
    // Insert all other members in a single query
    await querySQLDatabase(
      `INSERT INTO chat_members (chat_id, user_id) VALUES ${placeholders}`,
      values
    );
  }
    return res.status(201).json({ chat_id: newChatId, created : true });
  } catch (err) {
    console.error("Error creating chat:", err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getChatMessages(req, res) {
  const chat_id = req.body.chatId;
  const offset = req.body.offset || 0;
  if (chat_id === null || chat_id === undefined) {
    return res.status(400).json({error: 'Missing chat ID'});
  }
  const results = (await querySQLDatabase(
    "SELECT * FROM messages WHERE chat_id = ? ORDER BY sent_at DESC LIMIT ? OFFSET ?", 
    [chat_id, message_page_size, offset]
  ))[0];
  if (results.length === 0) {
    return res.status(404).json({error: 'No messages found for this chat'});
  }
  return res.status(200).json(results);
}

/** 
  * Send a message to an existing chat. To create a chat, one must use the createOrGetChat function.
  */
async function sendMessageExistingChat(req, res) {
  const senderId = req.session.user_id;
  const chatId = req.body.chat_id;
  const file = req.file;    // again, multer stores in object

  //validate sender identity
  if (!senderId) {
    return res.status(403).json({ error: 'Not logged in.' });
  }

  const messageContent = req.body.messageContent;

  if (!messageContent || !chatId) {
    return res.status(400).json({ error: 'Missing one or more fields from request: username, chat_id, messageContent' });
  }

  //validate existence of chat
  try {
    let results = (await querySQLDatabase("SELECT user_id FROM chat_members WHERE chat_id = ?", [chatId]))[0];
    if (results.length === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }
  } catch (err) {
    console.error("ERROR in sendMessage query:", err);
    return res.status(500).json({ error: 'Error querying database' });
  }

  //validate that sender is member of the chat
  try {
    const memberQueryString = "SELECT COUNT(*) AS count FROM chat_members WHERE chat_id = ? AND user_id = ?";
    const userMemberCheck = (await querySQLDatabase(memberQueryString,[chatId, senderId]))[0];

    if (userMemberCheck[0].count === 0) {
      return res.status(404).json({ error: 'Sender is not a member of the specified chat' });
    }
  } catch (err) {
    console.error("ERROR in chat member check:", err);
    return res.status(500).json({ error: 'Error querying database' });
  }

  //At this point, safe to send message

  let file_url = null;
  let file_type = null;

  try {
    if (file) {
      ({file_url, file_type} = await uploadToS3(file, 'message-files'));
    }
    await querySQLDatabase(
      "INSERT INTO messages (chat_id, sender_id, content, file_link, file_type) VALUES (?, ?, ?, ?, ?)",
      [chatId, senderId, messageContent, file_url, file_type]
    );
    return res.status(201).json({ message: 'Message sent successfully' });
  } catch (err) {
    console.error("ERROR in sendMessage insertion:", err);
    return res.status(500).json({ error: 'Error querying database' });
  }
}

/**
 * Create posts with a title, content, an optional parent post, and optional image.
 */
async function createPost(req, res) {
    const user_id = req.session.user_id;
    if (!user_id) {
      return res.status(403).json({error: 'Not logged in.'});
    }

    const title = req.body.title;
    const content = req.body.content;
    const parent_id = req.body.parent_id;
    const image = req.file; // multer stores the binary file in req.file
    let image_path = null;

    if (image) {
        image_path = await uploadToS3(image, "feed_posts").path;
    }

    //we choose to prevent _any_ empty fields, rather than allowing SOME to be empty
    if (!title?.trim() || !content?.trim()) {
        return res.status(400).json({error: 'One or more of the fields you entered was empty, please try again.'});
    }

    //note that the mysql js driver converts a null object (like image_path) to NULL 
    try {
        await querySQLDatabase("INSERT INTO posts (parent_post, title, content, image_link, author_id) VALUES (?, ?, ?, ?, ?);", 
          [parent_id, title, content, image_path, user_id]);
        
        // send post to Kafka
        const federatedPost = {
          username: username,
          source_site: 'instakann', 
          post_uuid_within_site: uuidv4(), // create unique id
          post_text: `${content}`,
          content_type: 'text/plain'
      }
      await sendFederatedPost(federatedPost);
    } catch (err) {
        console.log("ERROR in createPost ", err);
        res.status(500).json({error: 'Error querying database.'});
    }
    return res.status(201).json({message: "Post created."});
}

async function getChatBot(req, res) {
  console.log('Getting movie database');
  const vs = await getVectorStore();
  console.log('Connected...');
  const retriever = vs.asRetriever();
  console.log('Ready to run RAG chain...');

  const prompt =
    PromptTemplate.fromTemplate('Given that {context}, answer the following question. {question}');
  
  const llm = new ChatOpenAI({
    modelName: "gpt-3.5-turbo", temperature: 0
  });

  const embeddings = new OpenAIEmbeddings({
    modelName: "text-embedding-ada-002"
  });

  // Get embedding of question
  const question = req.body.question;
  console.log('question: ', question);
  let embedding = null;
  try {
    embedding = await embeddings.embedQuery(question);
  } catch (error) {
    console.error("Error embedding question:", error);
    return res.status(500).json({error: "Error while embedding question."});
  }

  // Get top 5 matches from ChromaDB.
  const collectionName = "text_embeddings";
  const topK = 3;
  const results = await chroma_db.get_items_from_table(collectionName, embedding, topK);
  const matchContext = (results.documents[0]).join('\n');

  const ragChainImdb = RunnableSequence.from([
    {
        context: retriever.pipe(formatDocumentsAsString),
        question: new RunnablePassthrough(),
      },
    prompt,
    llm,
    new StringOutputParser(),
  ]);
  let imdbContext = await ragChainImdb.invoke(req.body.question)
  imdbContext = await retriever.pipe(formatDocumentsAsString).invoke(question);

  const context = matchContext + "\n" + imdbContext;
  console.log(context);

  await chroma_db.get_item_count(collectionName);

  // Generate response.
  const ragChain = RunnableSequence.from([
    {
      context: async () => context,
      question: new RunnablePassthrough(),
    },
    prompt,
    llm,
    new StringOutputParser(),
  ]);
  const result = await ragChain.invoke(req.body.question);

  res.status(200).send({message: result});
}

export {
  registerUser,
  registerProfilePicture,
  getChatBot,
  postAddFriend,
  postRemoveFriend,
  createPost,
  createOrGetChat,
  sendMessageExistingChat,
  postLogin,
  postLogout,
  getFriends
}