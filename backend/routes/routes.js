import {get_db_connection} from '../models/rdbms.js';
import ChromaDB from '../models/vector.js';
import S3 from '../models/s3.js';
import FaceEmbed from '../models/face_embed.js';
import {v4 as uuidv4} from 'uuid';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
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
import { resolve } from 'path';
import { error } from 'console';


// Simple approach to determine config file path
const configPath = fs.existsSync('./config/config.json') 
  ? './config/config.json'           // Running from backend folder
  : 'backend/config/config.json';    // Running from root folder
const configFile = fs.readFileSync(configPath, 'utf8');
const config = JSON.parse(configFile);

// establish connections and initialize
const mysql_db = get_db_connection();
const chroma_db = ChromaDB();
const s3_db = new S3(config.s3BucketName);
const face = new FaceEmbed();
var vectorStore = null;
const message_page_size = config.socialParams.messagePageSize;
const maxSessionCollisionsTries = config.cryptoParams.maxCollisions;
const maxSessionCollisionTime = config.cryptoParams.maxTime;

/**
 * A helper function to upload files to S3
 * @param {Object} file - The file object from multer
 * @param {String} filePrefix - The prefix/virtual directory for the file name in S3
 * @returns The S3 path of the uploaded file
 */
async function uploadToS3(file, filePrefix) {
  const fileExtension = file.originalname.split('.').pop(); //gets the file extension by splitting by . and taking last element
  const fileName = `${filePrefix}/${Date.now()}-${uuidv4()}.${fileExtension}`; //scalability: use uuid + time to avoid name collisions
  console.log("File name: ", fileName);
  const s3_path = await s3_db.uploadBuffer(file.buffer, fileName, file.mimetype);
  const return_obj = {path: s3_path, type: file.mimetype};
  console.log("Result after uploading to S3: ", return_obj);
  return return_obj;
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
      return res.status(400).json({ error: 'registerUser: Invalid birthday format' });
    }

    if ([username, email, first_name, last_name, password, birthday, affiliation].some(field => field === undefined)) {
      return res.status(400).json({ error: 'registerUser: Missing required fields' });
    }

    try {
      const usernameMatches = await querySQLDatabase(`SELECT COUNT(*) AS ucount FROM users WHERE username = ?`, [username]);
      if (usernameMatches[0][0].ucount > 0) {
        return res.status(400).json({ error: 'registerUser: Username already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const insertCommand = 'INSERT INTO users (username, email, first_name, last_name, birthday, affiliation, hashed_password) VALUES (?, ?, ?, ?, ?, ?, ?)';
      const params = [username, email, first_name, last_name, birthday, affiliation, hashedPassword];
      await querySQLDatabase(insertCommand, params);
      const user_id = (await querySQLDatabase('SELECT user_id FROM users WHERE username = ?', [username]))[0].user_id;

      req.session.user_id = user_id;  //set session id
      return res.status(201).json({ message: `User ${username} registered successfully`});
    } catch (error) {
      console.error(`Error registering user ${username}:`, error);
      return res.status(500).json({error: 'Internal server error'});
    }
}


/**
 * Middleware to authenticate requests using session token
 */
async function authenticateRequest(req, res, next) {
  const sessionToken = req.cookies?.session_token;
  
  const sessionResult = await getIdFromSToken(sessionToken);
  
  if (!sessionResult.success) {
    return res.status(sessionResult.errCode).json({ error: sessionResult.error });
  }
  
  // Add user ID to request object for use in route handlers
  if (!req.session) {
    req.session = {};   //if we aren't using express-session, req.session may not always exist
  }
  req.session.user_id = sessionResult.userId;
  
  // Continue to the route handler
  next();
}

/**
 * 
 * @param {string} sessionToken 
 * @returns success is true if the session token is valid
 * and userId is the ID of the user associated with that session
 */
async function getIdFromSToken(sessionToken) {
  if (sessionToken === undefined || sessionToken === null) {
    return {success: false, userId: null, errCode: 401, error: 'Session token is missing'};
  }
  let results;
  try {
    results = (await querySQLDatabase(
      'SELECT user_id FROM users WHERE session_id = ? AND expires_at > CURRENT_TIMESTAMP',
      [sessionToken]
    ))[0];
    return results.length > 0 ? 
      {success: true, userId: results[0].user_id} : 
      {success: false, userId: null, errCode: 401, error: 'Session token is invalid or expired'};
  } catch (err) {
    console.log("Error querying database while getting user ID:", err);
    return {success: false, userId: null, errCode: 500, error: 'Internal server error'};
  }
}

async function startSession(userID) {
  const attemptStartTime = Date.now();
  let retries = 0;
  let sessionToken = null, results;
  let success = false;
  while (retries < maxSessionCollisionsTries && Date.now() - attemptStartTime < maxSessionCollisionTime) {
    sessionToken = crypto.randomBytes(64).toString('base64url');
    //console.log(`Attempt: ${retries + 1}, Milliseconds elapsed: ${Date.now() - attemptStartTime}, Session token: ${sessionToken}\n`);
    try {
      results = (await querySQLDatabase('SELECT COUNT(*) AS count FROM sessions WHERE session_token = ?', [sessionToken]))[0];
    } catch (err) {
      console.log("Error querying database while creating session:", err);
      return {success, sessionToken: null, errCode: 500};
    }

    if (results[0].count === 0) {
      let loginTime = new Date();
      await querySQLDatabase('INSERT INTO sessions (user_id, created_at, session_token) VALUES (?, ?, ?);', [userID, loginTime, sessionToken]);
      //new Date() defaults to now, and is converted by the mysql2 driver to the appropriate time format
      await querySQLDatabase('UPDATE users SET last_online = ? WHERE user_id = ?', [loginTime, userID]);
      return {success: true, sessionToken, errCode: 201};
    }
    retries++;
    await sleep(20); // Sleep for 20ms before retrying
  }
  console.log(`Failed to create session for ${username}: timeout or max attempts reached after ${retries} attempts`);
  return {success, sessionToken, errCode: 503};
}

//utility function to prevent server overloading with queries
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// POST /login
async function postLogin(req, res) {
  console.log(req.body);
  var username = req.body.username;
  var plain_password = req.body.password;
  if (!username || !plain_password) {
      return res.status(400).json({error: 'postLogin: One or more of the fields you entered was empty, please try again.'});
  }
  let results;
  console.log('Logging in user: ' + username);

  // check if user exists then match password. If appropriate, set session
  try {
      results = (await querySQLDatabase("SELECT user_id, hashed_password FROM users WHERE username = ?", [username]))[0];  //remove the format thing
      console.log(results);
  } catch (err) {
      return res.status(500).json({error: 'Error querying database'});
  }

  const comparePasswordPromise = (password, hash) => {
    return new Promise((resolve, reject) => {
      bcrypt.compare(password, hash, (err, success) => {
        if (err) reject(err);
        else resolve(success);
      });
    });
  };

  const userExists = results.length > 0;
  const hashed_password = userExists ? 
    results[0].hashed_password : 
    "$2b$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    //dummy value to prevent timing attacks

  const passwordHashMatch = await comparePasswordPromise(plain_password, hashed_password);
  
  //ensure that there isn't a hash collision
  if (passwordHashMatch && userExists) {
    const user_id = results[0].user_id;
    let sessionResult = await startSession(user_id);

    if (sessionResult.success === false) {
      console.log("Failed to create session");
      return res.status(sessionResult.errCode).json({error: 'Failed to create session, please try again later.'});
    }
    res.cookie(
      'session_token',
      sessionResult.sessionToken,
      {
        httpOnly: true,
        secure: true
      }
    );    
    //Set session id for successful login
    //Ensures that it can only be accessed via HTTPS ('secure') and not client-side JS ('httpOnly') 
      
    return res.status(200).json({username: username});
  } else {
    return res.status(401).json({error: 'Username and/or password are invalid.'});
  }
}


// POST /logout
async function postLogout(req, res) {
  const sessionToken = req.cookies?.session_token; //if cookies is undefined, sessionToken will be undefined
  if (!sessionToken) {
    return res.status(400).json({error: 'No session cookie set.'});
  }

  res.clearCookie('session_token', {
    httpOnly: true,
    secure: true
  });
  
  try {
    await querySQLDatabase("DELETE FROM sessions WHERE session_token = ?", [sessionToken]);
    await querySQLDatabase("UPDATE users SET last_online = CURRENT_TIMESTAMP WHERE user_id = ?", [req.session.user_id]); 
    //update last_online timestamp
  } catch (err) {
    console.log("Error ending session:", err);
    return res.status(500).json({error: 'Internal server error'});
  }
  return res.status(200).json({message: "You were successfully logged out."});
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

  let s3_path;
  try {
    s3_path = (await uploadToS3(profilePic, "profile-pics")).path;
  } catch(err) {
    console.error("Error uploading profile picture to S3:", err);
    return res.status(500).json({ error: 'Internal server error' });
  }

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
    top_matches = (await chroma_db.get_items_from_table(config.chromaDbName, embedding, 5)).documents[0];
  } catch (error) {
    console.error(`Error getting top matches for user ${userId}:`, error);
    return res.status(500).json({error: 'Internal server error'});
  }
  console.log("Top chroma matches: ",top_matches);
  return res.status(200).json({ message: 'Profile picture added successfully', top_matches });
}


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
        // Modified query to include last_online and session data to determine online status
        results = (await querySQLDatabase(
          "SELECT u_followed.username, u_followed.last_online, " +
          "CASE WHEN u_followed.last_online > DATE_SUB(NOW(), INTERVAL 1 MINUTE) THEN 1 ELSE 0 END AS is_online " +
          "FROM users AS u_follower JOIN friends AS f ON " +
          "u_follower.user_id = f.follower JOIN users AS u_followed ON u_followed.user_id = f.followed " +
          "WHERE u_follower.user_id = ?;", [currId]))[0]; 
        
        return res.status(200).json(results);
    } catch (err) {
        console.log("ERROR in getFriends query:",err);
        return res.status(500).json({error: 'Error querying database'});
    }
}

//POST /addFriend
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
      "SELECT COUNT(*) AS count FROM friends WHERE (follower = ? AND followed = ?) OR (follower = ? AND followed = ?)",
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

//POST /removeFriend
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
    friendId = results[0][0].user_id;
    console.log("FRIEND ID: ", friendId);
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
    return res.status(200).json({ message: 'Friend removed successfully', friendUsername });
  } catch (err) {
    console.log("ERROR in removeFriend deletion:", err);
    return res.status(500).json({ error: 'Error querying database' });
  }
}

// /POST /sendChatInvite
async function sendChatInvite(req, res) {
  const senderId = req.session.user_id;
  if (!senderId) {
    return res.status(403).json({ error: 'Not logged in.' });
  }

  const recipientUsername = req.body.recipientUsername;
  const chatId = req.body.chatId;

  if (!recipientUsername || !chatId) {
    return res.status(400).json({ error: 'Missing recipient username or chat ID' });
  }

  try {
    // Validate recipient exists
    const recipientResult = (await querySQLDatabase("SELECT user_id FROM users WHERE username = ?", 
      [recipientUsername]))[0];
    if (recipientResult.length === 0) {
      return res.status(404).json({ error: 'Recipient not found' });
    }
    const recipientId = recipientResult[0].user_id;

    // Validate chat exists
    const chatExists = (await querySQLDatabase(
      "SELECT COUNT(*) AS count FROM chat_members WHERE chat_id = ?", 
      [chatId]
    ))[0].count > 0;

    if (!chatExists) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Validate that sender is an active member of the chat
    const senderIsMember = (await querySQLDatabase(
      "SELECT COUNT(*) AS count FROM chat_members WHERE chat_id = ? AND user_id = ? AND left_at IS NULL",
      [chatId, senderId]
    ))[0][0].count > 0;

    if (!senderIsMember) {
      return res.status(403).json({ error: 'Sender is not a member of the specified chat' });
    }

    // Validate that recipient is not already an active member of the chat
    const isMember = (await querySQLDatabase(
      "SELECT COUNT(*) AS count FROM chat_members WHERE chat_id = ? AND user_id = ? AND left_at IS NULL", 
      [chatId, recipientId]
    ))[0][0].count > 0;

    if (isMember) {
      return res.status(400).json({ error: 'Recipient is already a member of the chat' });
    }

    // Check if invite to this chat already exists for this user
    const existingInvite = (await querySQLDatabase(
      "SELECT COUNT(*) AS count FROM chat_invites WHERE chat_id = ? AND recipient_id = ? AND accepted_at IS NULL",
      [chatId, recipientId]
    ))[0][0].count > 0;

    if (existingInvite) {
      return res.status(400).json({ error: 'Invite already exists for this user' });
    }

    // Get the members of the prospective chat
    const members = (await querySQLDatabase(
      "SELECT u.username FROM chat_members JOIN users AS u ON u.user_id = chat_members.user_id WHERE chat_id = ?",
      [chatId]
    ))[0].map(row => row.username);

    members.push(recipientUsername);

    // Check if such a chat would violate duplicates
    const duplicateChatId = await findChat(members);
    if (duplicateChatId != null) {
      return res.status(400).json({ error: 'Chat already exists with these members', duplicateChatId});
    }

    // Insert chat invite
    await querySQLDatabase(
      "INSERT INTO chat_invites (chat_id, sender_id, recipient_id) VALUES (?, ?, ?)", 
      [chatId, senderId, recipientId]
    );

    return res.status(201).json({ message: 'Chat invite sent successfully' });
  } catch (err) {
    console.error("Error sending chat invite:", err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /chatInvites
async function getChatInvites(req, res) {
  const userId = req.session.user_id;
  if (!userId) {
    return res.status(403).json({ error: 'Not logged in.' });
  }
  try {
    const invites = (await querySQLDatabase(
      "SELECT ci.invite_id, ci.chat_id, u.username AS sender_username \
      FROM chat_invites AS ci JOIN users AS u ON ci.sender_id = u.user_id \
      WHERE ci.recipient_id = ? AND ci.accepted_at IS NULL AND ci.rejected_at IS NULL",
      [userId]
    ))[0];

    // Format the response to include sender's username and chat ID - perhaps we can say 
    // something like "User A has invited you to join B, C, and others in chat" using the chatId
    const formattedInvites = invites.map(invite => ({
      inviteId: invite.invite_id,
      chatId: invite.chat_id,
      senderUsername: invite.sender_username
    }));

    return res.status(200).json({ invites: formattedInvites });
  } catch (err) {
    console.error("Error retrieving chat invites:", err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// /POST /acceptChatInvite
async function acceptChatInvite(req, res) {
  const recipientId = req.session.user_id;
  if (!recipientId) {
    return res.status(403).json({ error: 'Not logged in.' });
  }

  const inviteId = req.body.inviteId;

  if (!inviteId) {
    return res.status(400).json({ error: 'Missing invite ID' });
  }

  try {
    // Validate chat exists
    const chatExists = (await querySQLDatabase(
      "SELECT COUNT(*) AS count FROM chat_members WHERE chat_id = ?",
      [chat_id]
    ))[0].count > 0;

    if (!chatExists) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Validate invite is active and is for the current user
    const invite = (await querySQLDatabase(
      "SELECT chat_id, sender_id FROM chat_invites WHERE invite_id = ? AND recipient_id = ? \
      AND accepted_at IS NULL AND rejected_at IS NULL",
      [inviteId, recipientId]
    ))[0];

    if (invite.length === 0) {
      return res.status(404).json({ error: 'Invite not found or already accepted' });
    }

    const chat_id = invite[0].chat_id;
    const sender_id = invite[0].sender_id;

    // Add recipient to the chat
    await querySQLDatabase(
      "INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)",
      [chat_id, recipientId]
    );

    // Mark invite as accepted
    await querySQLDatabase(
      "UPDATE chat_invites SET accepted_at = CURRENT_TIMESTAMP WHERE invite_id = ?",
      [inviteId]
    );

    return res.status(200).json({ message: 'Invite accepted successfully', chat_id, sender_id });
  } catch (err) {
    console.error("Error accepting invite:", err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// /POST /rejectChatInvite
async function rejectChatInvite(req, res) {
  const userId = req.session.user_id;
  if (!userId) {
    return res.status(403).json({ error: 'Not logged in.' });
  }
  const inviteId = req.body.inviteId;
  if (!inviteId) {
    return res.status(400).json({ error: 'Missing invite ID' });
  }
  try {
    // Validate invite exists and is for the current user
    const invite = (await querySQLDatabase(
      "SELECT chat_id FROM chat_invites WHERE invite_id = ? AND recipient_id = ? \
      AND accepted_at IS NULL AND rejected_at IS NULL",
      [inviteId, userId]
    ))[0];

    if (invite.length === 0) {
      return res.status(404).json({ error: 'Invite not found or already resolved' });
    }

    const chat_id = invite[0].chat_id;
    // Validate chat exists
    const chatExists = (await querySQLDatabase(
      "SELECT COUNT(*) AS count FROM chat_members WHERE chat_id = ?",
      [chat_id]
    ))[0].count > 0;
    
    if (!chatExists) {
      return res.status(404).json({ error: 'Chat not found' });  
      //this could happen if chat got deleted before user accepts i.e. everyone leaves
    }

    // Mark invite as rejected
    await querySQLDatabase(
      "UPDATE chat_invites SET rejected_at = CURRENT_TIMESTAMP WHERE invite_id = ?",
      [inviteId]
    );

    return res.status(200).json({ message: 'Invite rejected successfully' });
  } catch (err) {
    console.error("Error rejecting invite:", err);
    return res.status(500).json({ error: 'Internal server error' });
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
    return res.status(500).json({error: 'Internal server error when querying:\n' + err});
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

//GET /messages
/**
 * Get messages for a specific chat. The chat_id and offset are passed in the request body.
 * The offset is used for pagination/infinite scrolling within chats.
 * @return The messages for that chat in descending order of timestamp, offset by the given amount
 */
async function getChatMessages(req, res) {
  const userId = req.session.user_id;
  if (!userId) {
    return res.status(403).json({error: 'Not logged in.'});
  }
  
  const chat_id = req.body.chatId;
  const offset = req.body.offset || 0;
  if (chat_id === null || chat_id === undefined) {
    return res.status(400).json({error: 'Missing chat ID'});
  }
  
  try {
    // First verify chat exists
    const chatExists = (await querySQLDatabase(
      "SELECT COUNT(*) AS count FROM chat_members WHERE chat_id = ?", 
      [chat_id]
    ))[0][0].count > 0;
    
    if (!chatExists) {
      return res.status(404).json({error: 'Chat not found'});
    }

    // Then verify user is a member of the chat
    const userMemberStatus = (await querySQLDatabase(
      "SELECT user_id, left_at AS count FROM chat_members WHERE chat_id = ? AND user_id = ?",
      [chat_id, userId]
    ))[0];

    if (userMemberStatus.length === 0) {
      return res.status(403).json({error: 'User is not a member of chat'});
    }

    const queryParams = [chat_id];
    let queryString = "SELECT * FROM messages WHERE chat_id = ?";

    if (left_at !== null) {
      queryString += " AND sent_at <= ?";
      queryParams.push(left_at);  //if they left, only display things from _before_ they left
    }

    queryString += " ORDER BY sent_at DESC LIMIT ? OFFSET ?";
    queryParams.push(message_page_size, offset);

    const left_at = userMemberStatus[0].left_at;
    
    // Then get messages
    const results = (await querySQLDatabase(queryString, queryParams))[0];

    const responseObj = {
      messages: results,
      isComplete: results.length < message_page_size,          // True if we got fewer messages than requested
      nextOffset: isComplete ? null : offset + results.length  // if isComplete, no more offset
    };
    if (left_at !== null) {
      responseObj.left_at = left_at;
    }
    return res.status(200).json(responseObj); //can display something like <you left this chat at TIME on DATE>
  } catch (err) {
    console.error("Error retrieving chat messages:", err);
    return res.status(500).json({error: 'Internal server error'});
  }
}

// /POST /sendMessage 
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
    return res.status(400).json({ error: 'sendMessage: Missing one or more fields from request: username, chat_id, messageContent' });
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

  //validate that sender is active member of the chat
  try {
    const userMemberCheck = (await querySQLDatabase(
      "SELECT COUNT(*) AS count FROM chat_members WHERE chat_id = ? AND user_id = ? AND left_at IS NULL",
      [chatId, senderId])
    )[0];

    if (userMemberCheck[0].count === 0) {
      return res.status(403).json({ error: 'Sender is not a member of the specified chat' });
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
      try {
        ({file_url, file_type} = await uploadToS3(file, 'message-files'));
      } catch (err) {
        console.error("ERROR uploading file in sendMessage:", err);
        return res.status(500).json({ error: 'Error uploading file' });
      }
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
 * Extracts hashtags from a given text.
 * @param {String} text - The input text containing hashtags.
 * @returns {Array<String>} - An array of unique hashtags (without the # symbol).
 */
function extractHashtags(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  const hashtagRegex = /#(\w+)/g;
  const matches = [...text.matchAll(hashtagRegex)];
  const hashtags = matches.map(match => match[1].toLowerCase());
  return [...new Set(hashtags)]; // Return unique hashtags
}

/**
 * Create posts with a title, content, an optional parent post, and optional image.
 */
async function createPost(req, res) {
    const user_id = req.session.user_id;
    console.log('Session user:', req.session.user_id);

    //const username = req.params.username;
    if (!user_id) {
      return res.status(403).json({error: 'Not logged in.'});
    }

    let username;

    try {
        username = (await querySQLDatabase("SELECT username FROM users WHERE user_id = ?", [user_id]))[0][0]?.username;
        if (!username) {
          return res.status(400).json({error: 'User not found'});
        }
    } catch (err) {
        console.error("ERROR getting username in createPost query:", err);
        return res.status(500).json({error: 'Error querying database'});
    }

    const title = req.body.title;
    const content = req.body.content;
    const parent_id = req.body.parent_id;

    const image = req.file; // multer stores the binary file in req.file
    let image_path = null;

    if (image) {
      try {
        image_path = (await uploadToS3(image, "feed_posts")).path;
      } catch(err) {
        console.error("ERROR uploading image in createPost:", err);
        return res.status(500).json({error: 'Error uploading image'});
      }
    }

    //we choose to prevent _any_ empty fields, rather than allowing SOME to be empty
    if (!title?.trim() || !content?.trim()) {
        return res.status(400).json({error: 'One or more of the fields you entered was empty, please try again.'});
    }

    //note that the mysql js driver converts a null object (like image_path) to NULL 
    try {
        const hashtagString = JSON.stringify(extractHashtags(content)); // Extract hashtags from content
        await querySQLDatabase("INSERT INTO posts ( \
          parent_post, title, content, image_link, author_username, hashtags) \
          VALUES (?, ?, ?, ?, ?, ?);", 
          [parent_id, title, content, image_path, username, hashtagString]
        );
        
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
        return res.status(500).json({error: 'Error querying database.'}); //remember to return to avoid double-sending!!
    }
    return res.status(201).json({message: "Post created."});
}

async function getFeed(req, res) {
  const user_id = req.session.user_id;
  if (!user_id) {
    return res.status(403).json({error: 'Not logged in.'});
  }

  return res.status(200).json({message: "Feed retrieval not yet implemented."});
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

  if (question === null || question === undefined) {
    return res.status(400).json({error: 'No question provided'});
  }
  console.log('question: ', question);
  let embedding = null;
  try {
    embedding = await embeddings.embedQuery(question);
  } catch (error) {
    console.error("Error embedding question:", error);
    return res.status(500).json({error: "Error while embedding question."});
  }

  // Get top k matches from ChromaDB.
  const collectionName = "text_embeddings";
  const topK = 3;
  const results = await chroma_db.get_items_from_table(collectionName, embedding, topK);
  const matchContext = (results.documents[0]).join('\n');

  // Get match from imdb reviews.
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

// POST /updateActivity
async function postUpdateActivity(req, res) {
  const userId = req.session.user_id;
  if (!userId) {
    return res.status(403).json({error: 'Not logged in.'});
  }
  
  try {
    await querySQLDatabase("UPDATE users SET last_online = CURRENT_TIMESTAMP WHERE user_id = ?", [userId]);
    return res.status(200).json({success: true});
  } catch (err) {
    console.error("Error updating activity:", err);
    return res.status(500).json({error: 'Internal server error'});
  }
}

export {
  registerUser,
  registerProfilePicture,
  getChatBot,
  postAddFriend,
  postRemoveFriend,
  sendChatInvite,
  getChatInvites,
  acceptChatInvite,
  rejectChatInvite,
  createPost,
  createOrGetChat,
  sendMessageExistingChat,
  getFeed,
  postLogin,
  postLogout,
  getFriends,
  getChatMessages,
  postUpdateActivity,
  authenticateRequest
}