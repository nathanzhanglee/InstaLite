import {get_db_connection} from '../models/rdbms.js';
import ChromaDB from '../models/vector.js';
import S3 from '../models/s3.js';
import FaceEmbed from '../models/face_embed.js';
import {v4 as uuidv4} from 'uuid';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import fs from 'fs';
import multer from 'multer';

// for .env
import dotenv from 'dotenv';
dotenv.config({path: './.env'});
console.log('OpenAI API Key:', process.env.OPENAI_API_KEY);

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
import { runConsumer } from '../kafka/consumer.js';


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
const face = new FaceEmbed(config.faceEmbedModelPath);
var vectorStore = null;

//initialize configuration variables
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
  console.log("Result after uploading to S3: ", s3_path, file.mimetype);
  return s3_path;
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
    console.log("REQUEST BODY:\n",req.body);
    //initialize variables from request
    const username = req.body.username;
    const email = req.body.email;
    const first_name = req.body.fname;
    const last_name = req.body.lname;
    const password = req.body.password;
    const birthday = req.body.birthday;   
    const affiliation = req.body.affiliation;
    const hashtags = req.body.interests || [];  // Default to empty array if not provided [passed in as INTERESTS on frontend FormData]
    const profilePic = req.file || null;  // Default to null if not provided

    //think about how bday would be passed in: let's assume YYYY-MM-DD because that's how SQL wants it
    //validate birthday here
    if (!(birthday instanceof Date) && (typeof birthday !== 'string' || !birthday.match(/^\d{4}-\d{2}-\d{2}$/))) {
      console.log(`Invalid birthday format\n birthday: ${birthday}\n`);
      return res.status(400).json({ error: 'registerUser: Invalid birthday format' });
    }

    if ([username, email, first_name, last_name, password, birthday, affiliation].some(field => field === undefined)) {
      return res.status(400).json({ error: 'registerUser: Missing required fields' });
    }

    // Format hashtags as JSON string if provided as array
    const hashtagString = Array.isArray(hashtags) ? hashtags.map(hashtag => {
      hashtag.startsWith("#") ? hashtag.slice(1) : hashtag
    }).join(",") : typeof hashtags == 'string' ? extractHashtags(hashtags).join(",") : hashtags;

    let profile_pic_link;

    try {
      const usernameMatches = await querySQLDatabase(`SELECT COUNT(*) AS ucount FROM users WHERE username = ?`, [username]);
      if (usernameMatches[0][0].ucount > 0) {
        return res.status(400).json({ error: 'registerUser: Username already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      profile_pic_link = await uploadToS3(profilePic, "profile-pics");

      // Add hashtags and profile_pic_link to the SQL query
      const insertCommand = 'INSERT INTO users (username, email, first_name, last_name, birthday, affiliation, hashed_password, profile_pic_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
      const params = [username, email, first_name, last_name, birthday, affiliation, hashedPassword, profile_pic_link];
      
      const user_id = (await querySQLDatabase(insertCommand, params))[0].insertId;

      if (hashtags) {
        console.log("Adding hashtags: ",hashtagString);
        await querySQLDatabase("INSERT INTO hashtags(user_id, hashtag) VALUES (?, ?)",
          [user_id, hashtagString]);
      }

      // Start a session with proper cookie
      let sessionResult = await startSession(user_id);
      if (sessionResult.success) {
          res.cookie(
              'session_token',
              sessionResult.sessionToken,
              {
                  httpOnly: false,
                  secure: false, // set to true for production
                  sameSite: 'lax' 
              }
          );
      }
      
      return res.status(201).json({ 
        message: `User ${username} registered successfully`,
        userId: user_id,
        profilePicUrl: profile_pic_link
      });
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
      'SELECT user_id FROM sessions WHERE session_token = ? AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)',
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
  console.log(`Failed to create session for ${userID}: timeout or max attempts reached after ${retries} attempts`);
  return {success, sessionToken, errCode: 503};
}

//utility function to prevent server overloading with queries
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// POST /login
async function postLogin(req, res) {
  runConsumer();
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
        secure: false, // set to true for production
        sameSite: 'lax' 
      }
    );   
    //Set session id for successful login
    //Ensures that it can only be accessed via HTTPS ('secure') and not client-side JS ('httpOnly') 
      
    return res.status(200).json({
      username: username,
      userId: user_id  // Add the user ID to the response
    });
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
    secure: false,    //again, should be true for production
    sameSite: 'lax'
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
  // Try to get userId from session first
  let userId = req.session.user_id;
  
  // For new registrations, allow username as an alternative
  if (!userId && req.body.username) {
    try {
      // Look up the user by username
      const results = await querySQLDatabase('SELECT user_id FROM users WHERE username = ?', [req.body.username]);
      if (results[0] && results[0].length > 0) {
        userId = results[0][0].user_id;
      }
    } catch (err) {
      console.error("Error looking up user by username:", err);
    }
  }
  
  if (!userId) {
    return res.status(403).json({error: 'Not logged in or invalid username.'});
  }

  const profilePic = req.file;
  
  if (!profilePic) {
    return res.status(400).json({ error: 'No profile picture uploaded' });
  }

  let s3_path;
  try {
    s3_path = await uploadToS3(profilePic, "profile-pics");
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
    const chroma_db_name = config.chromaDbName;
    const embedding = await getEmbeddingFromPath(s3_path);
    
    // uncomment for local debugging
    // await listChromaCollections(chroma_db, chroma_db_name);

    top_matches = (await chroma_db.get_items_from_table(chroma_db_name, embedding, 5)).documents[0];
  } catch (error) {
    console.error(`Error getting top matches for user ${userId}:`, error);
    return res.status(500).json({error: 'Internal server error'});
  }
  
  if (!top_matches || top_matches.length === 0) {
    // this probably means chromadb isn't loaded
    return res.status(503).json({ error: 'Actor matching not working right now - try again later!' });
  }

  top_matches = matchesToResults(top_matches);
  return res.status(200).json({ message: 'Profile picture added successfully', top_matches });
}

/**
 * Generates a password reset token and sends a reset email using Resend
 * 
 * @param {Object} req - The request object containing the user's email
 * @param {Object} res - The response object
 * @returns {Promise} - Returns a promise that resolves to the API response
 */
async function forgotPassword(req, res) {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    // Check if user exists
    const user = (await querySQLDatabase(
      "SELECT user_id, username, email FROM users WHERE email = ?",
      [email]
    ))[0];

    if (user.length === 0) {
      // Security >:)
      return res.status(200).json({ 
        message: 'If an account with that email exists, a password reset link has been sent.' 
      });
    }

    const userId = user[0].user_id;
    const username = user[0].username;
    
    // Generate a secure token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
    
    // Create a new table for reset tokens if it doesn't exist yet
    // Can optimize when we sync up by moving into create tables script
    try {
      await querySQLDatabase(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id INT NOT NULL AUTO_INCREMENT,
          user_id INT NOT NULL,
          token VARCHAR(64) NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          used TINYINT(1) NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(user_id),
          PRIMARY KEY(id)
        )
      `);
    } catch (error) {
      // Only catch the specific error for duplicate table
      if (error.code === 'ER_TABLE_EXISTS_ERROR' || error.errno === 1050) {
        console.log('Table password_reset_tokens already exists, continuing...');
      } else {
        console.error('Password reset email sending error:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
    
    // Store the token in the database
    await querySQLDatabase(
      "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)",
      [userId, resetToken, tokenExpiry]
    );
    
    // Create the reset URL using the frontend URL from config
    const resetUrl = `${config.frontendUrl || 'http://localhost:4567'}/reset-password?token=${resetToken}`;
    
    // Initialize Resend with API key and send email
    const resend = new resend(config.resendAPIKey);
    console.log("RESEND instance", resend);

    const { data, error } = await resend.emails.send({
      from: 'InstaLite <armaana@sas.upenn.edu>', //we can add our email here...?
      to: email,
      subject: 'Password Reset Request',
      html: `
        <div>
          <h1>Hello ${username},</h1>
          <p>You requested a password reset. Please use the following link to reset your password:</p>
          <a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background-color: #4e5fe6; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
          <p>This link will expire in 10 minutes.</p>
          <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
          <p>Regards,<br>The InstaLite Team</p>
        </div>
      `
    });

    if (error) {
      console.error('Error sending email:', error);
      return res.status(500).json({ error: 'Failed to send password reset email' });
    }
    
    return res.status(200).json({ 
      message: 'If an account with that email exists, a password reset link has been sent.' 
    });
  } catch (error) {
    console.error('Password reset error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

//we can also periodically clear this table

/**
 * Validates a reset token and allows the user to set a new password
 * 
 * @param {Object} req - The request object containing the token and new password
 * @param {Object} res - The response object
 * @returns {Promise} - Returns a promise that resolves to the API response
 */
async function resetPassword(req, res) {
  const { token, newPassword } = req.body;
  
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }
  
  try {
    // Find the token and make sure it's valid
    const tokenResult = (await querySQLDatabase(
      "SELECT user_id FROM password_reset_tokens WHERE token = ? AND expires_at > CURRENT_TIMESTAMP AND used = 0",
      [token]
    ))[0];
    
    if (tokenResult.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    
    const userId = tokenResult[0].user_id;
    
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update the user's password
    await querySQLDatabase(
      "UPDATE users SET hashed_password = ? WHERE user_id = ?",
      [hashedPassword, userId]
    );
    
    // Mark the token as used
    await querySQLDatabase(
      "UPDATE password_reset_tokens SET used = 1 WHERE token = ?",
      [token]
    );
    
    return res.status(200).json({ message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Password reset error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}


/**
 * Get actor matches for a profile picture without requiring an authenticated user
 * Used during the signup process
 */
async function getActorMatches(req, res) {
  // Set up multer for this specific route
  const storage = multer.memoryStorage();
  const upload = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max size
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only images are allowed'), false);
      }
    }
  }).single('profilePic');

  // Handle the file upload directly in the route handler
  upload(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'File is too large. Maximum size is 2MB.' });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      }
      return res.status(400).json({ error: err.message });
    }
    
    const profilePic = req.file;
    
    if (!profilePic) {
      return res.status(400).json({ error: 'No profile picture uploaded' });
    }

    let matches;
    try {
      const chroma_db_name = config.chromaDbName;
      //const chroma_db_name = "imdb_photos";
      const embedding = (await face.getEmbeddingsFromBuffer(profilePic.buffer))[0];
      
      //for debugging in case the same chroma issue comes up
      //await listChromaCollections(chroma_db, chroma_db_name);
      if (!embedding) {
        return res.status(422).json({error: "Unable to find face in image. Make sure your image has a face!"}); //this is a somewhat important case
      }
      matches = (await chroma_db.get_items_from_table(chroma_db_name, embedding, 5)).documents[0];
    } catch (error) {
      console.error(`Error getting top matches:`, error.message);
      return res.status(500).json({error: 'Error processing image'});
    }
    
    if (!matches || matches.length === 0) {
      return res.status(503).json({ error: 'Actor matching not working right now - try again later!' });
    }

    matches = matchesToResults(matches);
    return res.status(200).json({ 
      message: 'Successfully found matches', 
      matches
    });
  });
}

//POST /associate
async function associateWithActor(req, res) {
  const userId = req.session.user_id;
  if (!userId) {
    return res.status(403).json({error: 'Not logged in.'});
  }

  let selectedActor = req.body.selectedActorNconst;
  let actorName = req.body.selectedActorName;
  //this could contain an nconst, chosen from the returned 5 results

  if (!selectedActor) {
    return res.status(400).json({error: 'No actor selected'});
  }

  try {
    await querySQLDatabase("UPDATE users SET linked_actor = ? WHERE user_id = ?", [selectedActor, userId]);
  } catch (err) {
    console.log("Error associating user with actor:", err);
    return res.status(500).json({error: 'Internal server error'});
  }
  return res.status(200).json({message: `You have been successfully associated with ${actorName}`});
}

/**
 * Function to debug local Chroma state and print out available collections
 * @param {*} ChromaClient the vector.js instance
 * @param {*} selected_db_name the name of the database that will be used
 * @returns prints to console the names and counts of all collections in the database
 */
async function listChromaCollections(ChromaClient, selected_db_name) {
  const rawClient = await ChromaClient.get_client();
  const cols = await rawClient.listCollections();
  for (const collectionName of cols) {
    const collection = await rawClient.getCollection({ name: collectionName });
    const count = await collection.count();
    console.log(`Collection: ${collectionName}, Count: ${count}`);
  }
  console.log("Available local collections: ",cols, "\nCollection used: ", selected_db_name);
  return cols;
}

/**
 * Converts an array of result strings in ChromaDB to a valid JSON object
 * @param {*} matches 
 * @returns 
 */
function matchesToResults(matches) {
  return matches.map(row => {
    let comma_tokens = row.slice(1,-1).split(',');
    let death_year = (comma_tokens[4] === '\\"\\"' || comma_tokens[4] === null) ? "" : comma_tokens[4];
    let image_key = comma_tokens[5].replace("imdb_crop/","");
    return {
      id: comma_tokens[0],
      nconst: comma_tokens[1],
      name: comma_tokens[2],
      birth_year: comma_tokens[3],
      death_year: death_year,
      image_key
    }
  });
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
          "CASE WHEN u_followed.last_online > DATE_SUB(NOW(), INTERVAL 15 SECOND) THEN 1 ELSE 0 END AS is_online " +
          "FROM users AS u_follower JOIN friends AS f ON " +
          "u_follower.user_id = f.follower JOIN users AS u_followed ON u_followed.user_id = f.followed " +
          "WHERE u_follower.user_id = ?;", [currId]))[0]; 
        
        return res.status(200).json(results);
    } catch (err) {
        console.log("ERROR in getFriends query:",err);
        return res.status(500).json({error: 'Error querying database'});
    }
}

//POST /sendFriendRequest
async function sendFriendRequest(req, res) {
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
    let friendResults = (await querySQLDatabase("SELECT user_id FROM users WHERE username = ?", [friendUsername]))[0];
    if (friendResults.length === 0) {
      return res.status(400).json({error: "User not found"});
    }
    friendId = friendResults[0].user_id;
  } catch (error) {
    return res.status(500).json({error: "Internal server error"});
  }

  try {
    let inviteResults = await querySQLDatabase(
      "SELECT * FROM friend_requests WHERE sender_id = ? AND recipient_id = ? AND status = 'pending'",
      [userId, friendId]
    );
    if (inviteResults[0].length !== 0) {
      return res.status(400).json({error: "There is already a pending friend request to this user"});
    }
  } catch (error) {
    return res.status(500).json({error: "Internal server error"});
  }

  try {
    await querySQLDatabase(
      "INSERT INTO friend_requests(sender_id, recipient_id) VALUES (?, ?)",
      [userId, friendId]
    );
  } catch (error) {
    return res.status(500).json({error: "Internal server error"});
  }

  return res.status(201).json(`Friend request successfully sent to ${friendUsername}`);
}

// GET /getFriendRequests
async function getFriendRequests(req, res) {
  const userId = req.session.user_id;
  if (!userId) {
    return res.status(403).json({error: 'Not logged in.'});
  }

  const requestType = req.query.type; // 'incoming' or 'outgoing'
  
  try {
    let results;
    if (requestType === 'incoming') {
      // Get requests where the current user is the recipient
      results = await querySQLDatabase(
        "SELECT fr.friend_request_id, u.username AS sender_username, u.profile_pic_link, fr.sent_at " +
        "FROM friend_requests fr " +
        "JOIN users u ON fr.sender_id = u.user_id " +
        "WHERE fr.recipient_id = ? AND fr.status = 'pending'",
        [userId]
      );
    } else {
      // Get requests where the current user is the sender
      results = await querySQLDatabase(
        "SELECT fr.friend_request_id, u.username AS recipient_username, fr.sent_at " +
        "FROM friend_requests fr " +
        "JOIN users u ON fr.recipient_id = u.user_id " +
        "WHERE fr.sender_id = ? AND fr.status = 'pending'",
        [userId]
      );
    }
    
    return res.status(200).json(results[0]);
  } catch (err) {
    console.error("Error in getFriendRequests:", err);
    return res.status(500).json({error: 'Error querying database'});
  }
}

// POST /cancelFriendRequest
async function cancelFriendRequest(req, res) {
  const userId = req.session.user_id;
  if (!userId) {
    return res.status(403).json({error: 'Not logged in.'});
  }
  
  const { requestId } = req.body;
  
  if (!requestId) {
    return res.status(400).json({error: 'Missing request ID'});
  }
  
  try {
    // Verify the request belongs to the current user
    const requestCheck = await querySQLDatabase(
      "SELECT COUNT(*) AS count FROM friend_requests WHERE friend_request_id = ? AND sender_id = ?",
      [requestId, userId]
    );
    
    if (requestCheck[0][0].count === 0) {
      return res.status(403).json({error: 'You do not have permission to cancel this request'});
    }
    
    // Delete the request
    await querySQLDatabase(
      "DELETE FROM friend_requests WHERE friend_request_id = ?",
      [requestId]
    );
    
    return res.status(200).json({message: 'Friend request canceled successfully'});
  } catch (err) {
    console.error("Error in cancelFriendRequest:", err);
    return res.status(500).json({error: 'Error querying database'});
  }
}

//POST /handleFriendRequest
async function postHandleFriendRequest(req, res) {
  const userId = req.session.user_id;
  if (!userId) {
    return res.status(403).json({error: 'Not logged in.'});
  }
  
  const friendUsername = req.body.friendUsername;

  if (!friendUsername) {
    return res.status(400).json({error: 'Missing friend username'});
  }

  let friendId;
  const accept = req.body.acceptRequest;
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

    const friendRequests = (await querySQLDatabase(
      "SELECT * FROM friend_requests WHERE sender_id = ? AND recipient_id = ? AND status = 'pending'",
      [friendId, userId]   //remember, the user is accepting/rejecting SOMEONE ELSE'S REQUEST
    ))[0];

    if (friendRequests.length === 0) {
      return res.status(400).json({error: "No pending friend requests from this user"})
    }

    if (accept) {
      await querySQLDatabase("UPDATE friend_requests SET status = 'accepted' WHERE sender_id = ? AND recipient_id = ?",
        [friendId, userId]
      );
      // Insert bidirectional friendship
      await querySQLDatabase("INSERT INTO friends (follower, followed) VALUES (?, ?), (?, ?)", [
        userId, friendId, friendId, userId
      ]);

      return res.status(201).json({ message: 'Friend request accepted', friendUsername });
    } else {
      await querySQLDatabase("UPDATE friend_requests SET status = 'rejected' WHERE sender_id = ? AND recipient_id = ?",
        [friendId, userId]
      );
      return res.status(201).json({message: 'Friend request rejected', friendUsername });
    }
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
    const recipientResult = (await querySQLDatabase(
      "SELECT user_id FROM users WHERE username = ?", 
      [recipientUsername]
    ))[0];
    
    if (recipientResult.length === 0) {
      return res.status(404).json({ error: 'Recipient not found' });
    }
    const recipientId = recipientResult[0].user_id;

    // Validate chat exists
    const chatExists = (await querySQLDatabase(
      "SELECT COUNT(*) AS count FROM chat_rooms WHERE chat_id = ?", 
      [chatId]
    ))[0][0].count > 0;

    if (!chatExists) {
      return res.status(404).json({ error: 'Chat room not found' });
    }

    // Validate that sender is an active member of the chat
    const isMember = (await querySQLDatabase(
      "SELECT COUNT(*) AS count FROM chat_members WHERE chat_id = ? AND user_id = ?",
      [chatId, senderId]
    ))[0][0].count > 0;

    if (!isMember) {
      return res.status(403).json({ error: 'You must be a member of the chat to send invites' });
    }

    // Check if ANY invitation already exists (regardless of status)
    const existingInvite = (await querySQLDatabase(
      "SELECT invite_id, status FROM chat_invites WHERE chat_id = ? AND recipient_id = ?",
      [chatId, recipientId]
    ))[0];

    if (existingInvite.length > 0) {
      // If there's an existing invite that's not pending, update it to pending
      if (existingInvite[0].status !== 'pending') {
        await querySQLDatabase(
          "UPDATE chat_invites SET status = 'pending', sender_id = ? WHERE invite_id = ?",
          [senderId, existingInvite[0].invite_id]
        );
        
        // Get chat room name for the response
        const chatNameResult = (await querySQLDatabase(
          "SELECT name FROM chat_rooms WHERE chat_id = ?",
          [chatId]
        ))[0][0].name;

        return res.status(200).json({
          message: 'Chat invitation updated to pending',
          chatId,
          chatName: chatNameResult,
          recipientUsername
        });
      } else {
        // Invitation is already pending
        return res.status(400).json({ error: 'An invitation is already pending for this user' });
      }
    }

    // If no existing invite is found, proceed with creating a new one...
    await querySQLDatabase(
      "INSERT INTO chat_invites (chat_id, sender_id, recipient_id) VALUES (?, ?, ?)",
      [chatId, senderId, recipientId]
    );

    // Get chat room name for the response
    const chatNameResult = (await querySQLDatabase(
      "SELECT name FROM chat_rooms WHERE chat_id = ?",
      [chatId]
    ))[0][0].name;

    return res.status(201).json({
      message: 'Chat invitation sent successfully',
      chatId,
      chatName: chatNameResult,
      recipientUsername
    });

  } catch (err) {
    console.log("ERROR in sendChatInvite:", err);
    return res.status(500).json({ error: 'Error sending chat invitation' });
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
      "SELECT ci.invite_id, ci.chat_id, cr.name AS chat_name, " +
      "u.username AS sender_username, ci.sent_at " +
      "FROM chat_invites ci " +
      "JOIN chat_rooms cr ON ci.chat_id = cr.chat_id " +
      "JOIN users u ON ci.sender_id = u.user_id " +
      "WHERE ci.recipient_id = ? AND ci.status = 'pending'",
      [userId]
    ))[0];

    return res.status(200).json(invites);
  } catch (err) {
    console.log("ERROR in getChatInvites:", err);
    return res.status(500).json({ error: 'Error fetching chat invitations' });
  }
}

// POST /respondToChatInvite
async function respondToChatInvite(req, res) {
  const userId = req.session.user_id;
  if (!userId) {
    return res.status(403).json({ error: 'Not logged in.' });
  }

  const { inviteId, accept } = req.body;
  
  if (!inviteId || accept === undefined) {
    return res.status(400).json({ error: 'Missing invite ID or response' });
  }

  try {
    // Verify the invite exists and belongs to the user
    const inviteResult = (await querySQLDatabase(
      "SELECT chat_id FROM chat_invites WHERE invite_id = ? AND recipient_id = ? AND status = 'pending'",
      [inviteId, userId]
    ))[0];

    if (inviteResult.length === 0) {
      return res.status(404).json({ error: 'Invitation not found or already processed' });
    }

    const chatId = inviteResult[0].chat_id;
    const newStatus = accept ? 'accepted' : 'rejected';

    // Update invitation status
    await querySQLDatabase(
      "UPDATE chat_invites SET status = ? WHERE invite_id = ?",
      [newStatus, inviteId]
    );

    // If accepted, add user to chat members
    if (accept) {
      // Check if user was previously a member
      const formerMember = (await querySQLDatabase(
        "SELECT COUNT(*) AS count FROM chat_members WHERE chat_id = ? AND user_id = ? AND left_at IS NOT NULL",
        [chatId, userId]
      ))[0][0].count > 0;

      if (formerMember) {
        // Re-activate the former member by setting left_at to NULL
        await querySQLDatabase(
          "UPDATE chat_members SET left_at = NULL WHERE chat_id = ? AND user_id = ?",
          [chatId, userId]
        );
      } else {
        // Add as a new member if they weren't a member before
        await querySQLDatabase(
          "INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)",
          [chatId, userId]
        );
      }
      
      // Get chat details for response
      const chatDetails = (await querySQLDatabase(
        "SELECT name FROM chat_rooms WHERE chat_id = ?", 
        [chatId]
      ))[0][0];

      return res.status(200).json({
        message: 'Chat invitation accepted',
        chatId,
        chatName: chatDetails.name
      });
    } else {
      return res.status(200).json({
        message: 'Chat invitation rejected'
      });
    }

  } catch (err) {
    console.log("ERROR in respondToChatInvite:", err);
    return res.status(500).json({ error: 'Error processing invitation response' });
  }
}

// GET /chatRooms
async function getChatRooms(req, res) {
  const userId = req.session.user_id;
  if (!userId) {
    return res.status(403).json({ error: 'Not logged in.' });
  }

  try {
    const chatRooms = (await querySQLDatabase(
      "SELECT cr.chat_id, cr.name, cr.created_at, " +
      "(SELECT COUNT(*) FROM chat_members WHERE chat_id = cr.chat_id AND left_at IS NULL) AS member_count " +
      "FROM chat_rooms cr " +
      "JOIN chat_members cm ON cr.chat_id = cm.chat_id " +
      "WHERE cm.user_id = ? AND cm.left_at IS NULL " + // Add this condition to filter out rooms the user has left
      "ORDER BY cr.created_at DESC",
      [userId]
    ))[0];

    return res.status(200).json(chatRooms);
  } catch (err) {
    console.log("ERROR in getChatRooms:", err);
    return res.status(500).json({ error: 'Error fetching chat rooms' });
  }
}

// GET /chatMembers/:chatId
async function getChatMembers(req, res) {
  const userId = req.session.user_id;
  if (!userId) {
    return res.status(403).json({ error: 'Not logged in.' });
  }

  const chatId = req.params.chatId;
  
  if (!chatId) {
    return res.status(400).json({ error: 'Chat ID is required' });
  }

  try {
    // Verify user is a member of the chat
    const isMember = (await querySQLDatabase(
      "SELECT COUNT(*) AS count FROM chat_members WHERE chat_id = ? AND user_id = ?",
      [chatId, userId]
    ))[0][0].count > 0;

    if (!isMember) {
      return res.status(403).json({ error: 'You are not a member of this chat' });
    }

    // Get members with online status - ADD THE LEFT_AT IS NULL CONDITION
    const members = (await querySQLDatabase(
      "SELECT u.user_id, u.username, u.profile_pic_link, " +
      "CASE WHEN u.last_online > DATE_SUB(NOW(), INTERVAL 15 SECOND) THEN 1 ELSE 0 END AS is_online, " +
      "cm.joined_at " +
      "FROM chat_members cm " +
      "JOIN users u ON cm.user_id = u.user_id " +
      "WHERE cm.chat_id = ? AND cm.left_at IS NULL " +
      "ORDER BY cm.joined_at",
      [chatId]
    ))[0];

    return res.status(200).json(members);
  } catch (err) {
    console.log("ERROR in getChatMembers:", err);
    return res.status(500).json({ error: 'Error fetching chat members' });
  }
}

// POST /sendMessage
async function sendChatMessage(req, res) {
  const userId = req.session.user_id;
  if (!userId) {
    return res.status(403).json({ error: 'Not logged in.' });
  }

  const { chatId, content } = req.body;
  
  if (!chatId || !content) {
    return res.status(400).json({ error: 'Chat ID and message content are required' });
  }

  try {
    // Verify user is a member of the chat
    const isMember = (await querySQLDatabase(
      "SELECT COUNT(*) AS count FROM chat_members WHERE chat_id = ? AND user_id = ?",
      [chatId, userId]
    ))[0][0].count > 0;

    if (!isMember) {
      return res.status(403).json({ error: 'You are not a member of this chat' });
    }

    // Create the message
    const messageId = uuidv4();
    await querySQLDatabase(
      "INSERT INTO chat_messages (message_id, chat_id, sender_id, content) VALUES (?, ?, ?, ?)",
      [messageId, chatId, userId, content]
    );

    return res.status(201).json({
      message: 'Message sent successfully',
      messageId,
      chatId
    });
  } catch (err) {
    console.log("ERROR in sendChatMessage:", err);
    return res.status(500).json({ error: 'Error sending message' });
  }
}

// GET /messages/:chatId
async function getChatMessages(req, res) {
  const userId = req.session.user_id;
  if (!userId) {
    return res.status(403).json({ error: 'Not logged in.' });
  }

  const chatId = req.params.chatId;
  const page = parseInt(req.query.page) || 0;
  const limit = parseInt(req.query.limit) || 20;
  
  if (!chatId) {
    return res.status(400).json({ error: 'Chat ID is required' });
  }

  try {
    // Verify user is a member of the chat
    const isMember = (await querySQLDatabase(
      "SELECT COUNT(*) AS count FROM chat_members WHERE chat_id = ? AND user_id = ?",
      [chatId, userId]
    ))[0][0].count > 0;

    if (!isMember) {
      return res.status(403).json({ error: 'You are not a member of this chat' });
    }

    // Get messages with pagination
    const messages = (await querySQLDatabase(
      "SELECT cm.message_id, cm.sender_id, u.username AS sender_username, " +
      "u.profile_pic_link AS sender_profile_pic, cm.content, cm.sent_at " +
      "FROM chat_messages cm " +
      "JOIN users u ON cm.sender_id = u.user_id " +
      "WHERE cm.chat_id = ? " +
      "ORDER BY cm.sent_at DESC " +
      "LIMIT ? OFFSET ?",
      [chatId, limit, page * limit]
    ))[0];

    return res.status(200).json(messages);
  } catch (err) {
    console.log("ERROR in getChatMessages:", err);
    return res.status(500).json({ error: 'Error fetching messages' });
  }
}

// POST /leaveChatRoom
async function leaveChatRoom(req, res) {
  const userId = req.session.user_id;
  if (!userId) {
    return res.status(403).json({ error: 'Not logged in.' });
  }

  const { chatId } = req.body;
  
  if (!chatId) {
    return res.status(400).json({ error: 'Chat ID is required' });
  }

  try {
    // Verify user is a member of the chat
    const isMember = (await querySQLDatabase(
      "SELECT COUNT(*) AS count FROM chat_members WHERE chat_id = ? AND user_id = ? AND left_at IS NULL",
      [chatId, userId]
    ))[0][0].count > 0;

    if (!isMember) {
      return res.status(403).json({ error: 'You are not a member of this chat' });
    }

    // delete the user from chat_members table
    await querySQLDatabase(
      "UPDATE chat_members SET left_at = NOW() WHERE chat_id = ? AND user_id = ?",
      [chatId, userId]
    );

    // Get username before emitting the leave event
    const userInfo = (await querySQLDatabase(
      "SELECT username FROM users WHERE user_id = ?", 
      [userId]
    ))[0][0];

    // Emit an event with both userId and username
    const io = req.app.get('io');
    io.to(`chat-${chatId}`).emit('userLeftChat', {
      userId: userId,
      username: userInfo.username
    });
    
    // if the user is the last member, delete the chat room
    const remainingMembers = (await querySQLDatabase(
      "SELECT COUNT(*) AS count FROM chat_members WHERE chat_id = ? AND left_at IS NULL",
      [chatId]
    ))[0][0].count;

    if (remainingMembers === 0) {
      // 1. First delete all messages in the chat
      await querySQLDatabase(
        "DELETE FROM chat_messages WHERE chat_id = ?",
        [chatId]
      );
      
      // 2. Then delete the members
      await querySQLDatabase(
        "DELETE FROM chat_members WHERE chat_id = ?",
        [chatId]
      );

      // 3. Finally delete the chat room itself
      await querySQLDatabase(
        "DELETE FROM chat_rooms WHERE chat_id = ?",
        [chatId]
      );
    }

    return res.status(200).json({
      message: 'Successfully left the chat room'
    });
  } catch (err) {
    console.log("ERROR in leaveChatRoom:", err);
    return res.status(500).json({ error: 'Error leaving chat room' });
  }
}

// POST /createChatRoom
async function createChatRoom(req, res) {
  const userId = req.session.user_id;
  if (!userId) {
    return res.status(403).json({ error: 'Not logged in.' });
  }

  const { roomName, initialMembers = [] } = req.body;
  
  if (!roomName) {
    return res.status(400).json({ error: 'Room name is required' });
  }
  
  try {
    // Create the chat room
    const result = await querySQLDatabase(
      "INSERT INTO chat_rooms (name, created_by) VALUES (?, ?)",
      [roomName, userId]
    );
    
    // Get the auto-generated ID
    const chatId = result[0].insertId;

    // Add the creator as a member
    await querySQLDatabase(
      "INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)",
      [chatId, userId]
    );

    // If there are initial members to invite, process them
    if (initialMembers.length > 0) {
      const placeholders = initialMembers.map(() => '?').join(',');
      const userResults = await querySQLDatabase(
        `SELECT username, user_id FROM users WHERE username IN (${placeholders})`,
        initialMembers
      );
      
      const userMap = {};
      userResults[0].forEach(user => {
        userMap[user.username] = user.user_id;
      });
      
      // Send invites to all valid users
      for (const username of initialMembers) {
        const recipientId = userMap[username];
        if (recipientId) {
          await querySQLDatabase(
            "INSERT INTO chat_invites (chat_id, sender_id, recipient_id) VALUES (?, ?, ?)",
            [chatId, userId, recipientId]
          );
        }
      }
    }

    return res.status(201).json({
      message: 'Chat room created successfully',
      chatId,
      roomName
    });
    
  } catch (err) {
    console.log("ERROR in createChatRoom:", err);
    return res.status(500).json({ error: 'Error creating chat room' });
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
    console.error("Error finding chat:", err);
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
    console.error("Error accessing chat:", err);
    return res.status(500).json({ error: 'Internal server error' });
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
        file_url = await uploadToS3(file, 'message-files');
        file_type = file.mimetype;
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
        image_path = await uploadToS3(image, "feed_posts");
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
        const post_id = (await querySQLDatabase("INSERT INTO posts ( \
          parent_post, title, content, image_link, author_username, hashtags) \
          VALUES (?, ?, ?, ?, ?, ?);", 
          [parent_id, title, content, image_path, username, hashtagString]
        ))[0].insertId;
        
        // send post to Kafka
        const federatedPost = {
          username: username,
          source_site: 'instakann', 
          post_uuid_within_site: post_id, // create unique id
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

// Function to insert the Bluesky Post into database
async function createBlueSkyPost(req, res) {
  const { title, content, parent_id, username, hashtags } = req.body;
  const imageUrl = req.file;

  if (!title || !content || !username) {
    return res.status(400).json({ error: 'Missing required fields (title, content, username)' });
  }

  try {
    // const checkQuery = "SELECT post_id FROM posts WHERE content = ? AND author_username = ?";
    // const existingPostResult = await querySQLDatabase(checkQuery, [content, username]);

    // // // If a post with the same content exists, skip the insert
    // if (existingPostResult[0] && existingPostResult[0].post_id) {
    //   const existingPostId = existingPostResult[0].post_id;
    //   console.log(`Post with the same content already exists. Skipping insertion. Existing post_id: ${existingPostId}`);
    //   return res.status(200).json({ message: 'Post with the same content already exists. Skipping insertion.' });
    // }

    const hashtagString = JSON.stringify(hashtags); // Ensure hashtags are JSON stringified
    const insertQuery = "INSERT INTO posts (parent_post, title, content, image_link, author_username, hashtags) VALUES (?, ?, ?, ?, ?, ?)";
    const post_id = (await querySQLDatabase(insertQuery, [
      parent_id,
      title,
      content,
      imageUrl || null,  // Image URL is optional
      username,
      hashtagString
      ]))[0].insertId;

    return res.status(201).json({ message: 'Bluesky post created successfully', post_id });
  } catch (error) {
    console.error("Error creating Bluesky post:", error);
    return res.status(500).json({ error: 'Internal server error while creating Bluesky post' });
  }
}

// Function to insert Federated Post into database
async function createFederatedPost(req, res) {
  const { title, content, parent_id, username, hashtags } = req.body;
  const imageUrl = req.file;

  if (!title || !content || !username) {
    return res.status(400).json({ error: 'Missing required fields (title, content, username)' });
  }

  try {
    // const checkQuery = "SELECT post_id FROM posts WHERE content = ? AND author_username = ?";
    // const existingPostResult = await querySQLDatabase(checkQuery, [content, username]);

    // // // If a post with the same content exists, skip the insert
    // if (existingPostResult[0] && existingPostResult[0].post_id) {
    //   const existingPostId = existingPostResult[0].post_id;
    //   console.log(`Post with the same content already exists. Skipping insertion. Existing post_id: ${existingPostId}`);
    //   return res.status(200).json({ message: 'Post with the same content already exists. Skipping insertion.' });
    // }
    
    const hashtagString = JSON.stringify(hashtags); // Ensure hashtags are JSON stringified
    const insertQuery = "INSERT INTO posts (parent_post, title, content, image_link, author_username, hashtags) VALUES (?, ?, ?, ?, ?, ?)";
    const post_id = (await querySQLDatabase(insertQuery, [
      parent_id,
      title,
      content,
      imageUrl || null,  // Image URL is optional
      username,
      hashtagString,
    ]))[0].insertId;

    return res.status(201).json({ message: 'Federated post created successfully', post_id });
  } catch (error) {
    console.error("Error creating Federated post:", error);
    return res.status(500).json({ error: 'Internal server error while creating Federated post' });
  }
}

// // GET /Rankings
// async function getFeed(req, res) {
//   const userId = req.session.user_id;
//   if (!userId) {
//     return res.status(403).json({error: 'Not logged in.'});
//   }

//   try {
//     // Get username from userId
//     const usernameResult = await querySQLDatabase(
//       "SELECT username FROM users WHERE user_id = ?",
//       [userId]
//     );
    
//     const username = usernameResult[0][0]?.username;
    
//     // query post info in descending order based on post_rankings for logged in user
//     const result = await querySQLDatabase(
//       `SELECT
//         p.post_id AS id,
//         p.title AS title,
//         p.content AS content, 
//         p.author_username AS username,
//         p.image_link
//        FROM post_rankings pr
//        JOIN posts p ON pr.post_id = p.post_id
//        WHERE pr.user_id = ?
//        ORDER BY pr.weight DESC
//        LIMIT 100`, 
//       [userId]
//     );
//     return res.status(200).json(result[0]);
//   } catch (err) {
//     console.error("Error getting feed:", err);
//     return res.status(500).json({error: 'Internal server error while querying feed'});
//   }
// }

// GET /Feed
async function getFeed(req, res) {
  try {
    const federatedPosts = await querySQLDatabase(
      `SELECT
        p.post_id AS id,
        p.title AS title,
        p.content AS content, 
        p.author_username AS username,
        p.image_link
       FROM posts p
       WHERE p.author_username = 'federatedPost'
       ORDER BY RAND()
       LIMIT 10`
    );

    const blueskyPosts = await querySQLDatabase(
      `SELECT
        p.post_id AS id,
        p.title AS title,
        p.content AS content, 
        p.author_username AS username,
        p.image_link
       FROM posts p
       WHERE p.author_username = 'BlueskyPost'
       ORDER BY RAND()
       LIMIT 10`
    );

    const posts = [...federatedPosts[0], ...blueskyPosts[0]];

    for (let i = posts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [posts[i], posts[j]] = [posts[j], posts[i]]; // Swap elements
    }

    return res.status(200).json(posts);
  } catch (err) {
    console.error("Error getting random feed:", err);
    return res.status(500).json({error: 'Internal server error while querying random feed'});
  }
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
    modelName: "gpt-4.1-nano", temperature: 0
  });

  const embeddings = new OpenAIEmbeddings({
    modelName: "text-embedding-3-small"
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
  const collectionName = "text_embeddings2";
  const topK = 3;
  const results = await chroma_db.get_items_from_table(collectionName, embedding, topK);
  let matchContext = (results.documents[0]).join('\n');
  matchContext = `Here is some information from the social network posts 
    and users about the question. Do not reference the posts themselves, just
    use the information in them to answer the question! Don't mention specific
    users or post titles. You can mention related hashtags if it makes sense. 
  ` + matchContext;

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

  let result = await ragChain.invoke(req.body.question);

  // Get post recommendations from embedding matches to add to result, if there are any.
  const postTitleLines = (results.documents[0]).filter(line => line.includes("post titled"));
  if (postTitleLines.length > 0) {
    result += "\n You might want to check out these posts for more info: ";
    postTitleLines.forEach(line => {
      const regex = /^(.*?) wrote a post titled (.*?), that says:/; // check if post
      const match = line.match(regex);
      if (match) {
        const author = match[1];
        const title = match[2];
        result += `"${title}", posted by ${author}". `;
      }
    });
  }

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

// GET user profile
async function getUserProfile(req, res) {
  const requestedUsername = req.params.username;

  try {
    // First get the basic user profile
    const profile = (await querySQLDatabase(
      "SELECT u.user_id, u.username, u.email, u.first_name, u.last_name, u.profile_pic_link, u.birthday, u.affiliation, " +
      "(SELECT COUNT(*) FROM friends WHERE followed = u.user_id) AS followers_count, " +
      "(SELECT COUNT(*) FROM friends WHERE follower = u.user_id) AS following_count " +
      "FROM users u WHERE u.username = ?",
      [requestedUsername]
    ))[0][0];

    if (!profile) {
      return res.status(404).json({error: 'User not found'});
    }

    // Now get the interests (hashtags) for this user
    const hashtags = (await querySQLDatabase(
      "SELECT hashtag FROM hashtags WHERE user_id = ?",
      [profile.user_id]
    ))[0];
    
    // Add interests to the profile object as an array
    profile.interests = hashtags.map(tag => tag.hashtag);

    return res.status(200).json(profile);
  } catch (err) {
    console.error("Error fetching user profile:", err);
    return res.status(500).json({error: 'Internal server error'});
  }
}

async function getUserPosts(req, res) {
  const requestedUsername = req.params.username;
  const userId = req.session.user_id; // The logged-in user
  
  if (!userId) {
    return res.status(403).json({error: 'Not logged in.'});
  }

  try {
    const posts = (await querySQLDatabase(
      "SELECT p.post_id, p.title, p.content, p.author_username, p.image_link " +
      "FROM posts p WHERE p.author_username = ? ORDER BY p.post_id DESC",
      [requestedUsername]
    ))[0];

    return res.status(200).json(posts || []);
  } catch (err) {
    console.error("Error fetching user posts:", err);
    return res.status(500).json({error: 'Internal server error'});
  }
}

async function updateProfile(req, res) {
  const userId = req.session.user_id;
  if (!userId) {
    return res.status(403).json({error: 'Not logged in.'});
  }

  // Extract data from form - note field names match what frontend sends
  const { first_name, last_name, email, birthday, affiliation } = req.body;
  let interests = [];
  
  try {
    // Parse interests from JSON string
    if (req.body.interests) {
      interests = JSON.parse(req.body.interests);
    }
    
    // First update the user profile in the users table
    await querySQLDatabase(
      "UPDATE users SET first_name = ?, last_name = ?, email = ?, birthday = ?, affiliation = ? WHERE user_id = ?",
      [first_name, last_name, email, birthday, affiliation, userId]
    );
    
    // Handle profile picture if provided
    if (req.file) {
      const s3_path = await uploadToS3(req.file, "profile-pics");
      await querySQLDatabase(
        "UPDATE users SET profile_pic_link = ? WHERE user_id = ?",
        [s3_path, userId]
      );
    }
    
    // Handle interests/hashtags separately
    // First, remove all existing hashtags for the user
    await querySQLDatabase(
      "DELETE FROM hashtags WHERE user_id = ?",
      [userId]
    );
    
    // Then insert new hashtags
    if (interests.length > 0) {
      const placeholders = interests.map(() => "(?, ?)").join(", ");
      const params = [];
      
      interests.forEach(hashtag => {
        // Remove # symbol if present
        const tag = hashtag.startsWith('#') ? hashtag.slice(1) : hashtag;
        params.push(userId, tag);
      });
      
      await querySQLDatabase(
        `INSERT INTO hashtags (user_id, hashtag) VALUES ${placeholders}`,
        params
      );
    }
    
    return res.status(200).json({message: 'Profile updated successfully'});
  } catch (err) {
    console.error("Error updating profile:", err);
    return res.status(500).json({error: 'Internal server error'});
  }
}

// POST /likePost
async function likePost(req, res) {
  const userId = req.session.user_id;
  if (!userId) {
    return res.status(403).json({error: 'Not logged in.'});
  }

  const postId = req.body.post_id;
  if (!postId) {
    return res.status(400).json({error: 'Post ID is required'});
  }

  try {
    // First check if user already liked this post
    const existingLike = (await querySQLDatabase(
      "SELECT COUNT(*) AS count FROM likes WHERE user_id = ? AND post_id = ?",
      [userId, postId]
    ))[0][0].count;

    if (existingLike > 0) {
      return res.status(400).json({error: 'You already liked this post'});
    }

    // Add the like
    await querySQLDatabase(
      "INSERT INTO likes (user_id, post_id) VALUES (?, ?)",
      [userId, postId]
    );


    return res.status(200).json({message: 'Post liked successfully'});
  } catch (err) {
    console.error("Error liking post:", err);
    return res.status(500).json({error: 'Internal server error'});
  }
}

// GET /checkLikeStatus
async function checkLikeStatus(req, res) {
  const userId = req.session.user_id;
  if (!userId) {
    return res.status(403).json({error: 'Not logged in.'});
  }

  const postId = req.query.post_id;
  if (!postId) {
    return res.status(400).json({error: 'Post ID is required'});
  }

  try {
    const result = (await querySQLDatabase(
      "SELECT COUNT(*) AS count FROM likes WHERE user_id = ? AND post_id = ?",
      [userId, postId]
    ))[0][0];

    return res.status(200).json({isLiked: result.count > 0});
  } catch (err) {
    console.error("Error checking like status:", err);
    return res.status(500).json({error: 'Internal server error'});
  }
}

// POST /createComment
async function createComment(req, res) {
  const userId = req.session.user_id;
  if (!userId) {
    return res.status(403).json({error: 'Not logged in.'});
  }

  const { post_id, content } = req.body;
  
  if (!post_id || !content) {
    return res.status(400).json({error: 'Post ID and content are required'});
  }

  try {
    // Get username from user_id
    const userResult = (await querySQLDatabase(
      "SELECT username FROM users WHERE user_id = ?",
      [userId]
    ))[0][0];

    if (!userResult) {
      return res.status(404).json({error: 'User not found'});
    }

    const username = userResult.username;

    // Create the comment (which is actually a new post with parent_post set)
    const result = await querySQLDatabase(
      "INSERT INTO posts (parent_post, content, author_username) VALUES (?, ?, ?)",
      [post_id, content, username]
    );

    return res.status(201).json({
      message: 'Comment created successfully',
      comment_id: result[0].insertId
    });
  } catch (err) {
    console.error("Error creating comment:", err);
    return res.status(500).json({error: 'Internal server error'});
  }
}


export {
  getUserProfile,
  getUserPosts,
  updateProfile,
  registerUser,
  registerProfilePicture,
  getActorMatches,
  postLogin,
  authenticateRequest,
  associateWithActor,
  getFriends,
  postLogout,
  postHandleFriendRequest,
  sendFriendRequest,
  postRemoveFriend,
  sendChatInvite,
  getChatInvites,
  respondToChatInvite,
  getChatRooms,
  getChatMembers,
  sendChatMessage,
  getChatMessages,
  leaveChatRoom,
  createChatRoom,
  createOrGetChat,
  forgotPassword,
  resetPassword,
  getFriendRequests,
  cancelFriendRequest,
  getFeed,
  createPost,
  createBlueSkyPost,
  createFederatedPost,
  getChatBot,
  sendMessageExistingChat,
  postUpdateActivity,
  listChromaCollections,
  likePost, 
  checkLikeStatus,
  createComment
}