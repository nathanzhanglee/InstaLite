import {get_db_connection} from '../models/rdbms.js';
import ChromaDB from '../models/vector.js';
import S3 from '../models/s3.js';
import FaceEmbed from '../models/face_embed.js';
import {v4 as uuidv4} from 'uuid';
import bcrypt from 'bcrypt';
import fs from 'fs';

const configFile = fs.readFileSync('backend/config/config.json', 'utf8');
const config = JSON.parse(configFile);

//establish connections and initialize
const mysql_db = get_db_connection();
const chroma_db = ChromaDB();
const s3_db = new S3(config.s3BucketName);
const face = new FaceEmbed();

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
  return s3_path;
}

async function getEmbeddingFromPath(filepath) {
  let key = filepath.split('.com/')[1];
  const buffer = await s3_db.fetchFileBinary(key);
  const embeddings = await face.getEmbeddingsFromBuffer(buffer);
  return embeddings[0];
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
    const user_id = (await querySQLDatabase('SELECT user_id WHERE username = ?', [username]))[0].user_id;

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

  const s3_path = await uploadToS3(profilePic, "profile-pics");

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
        res.status(403).json({error: 'Not logged in.'});
    } else {
        const currId = req.session.user_id;
        let results;
        console.log('Getting friends for ' + currId);
        // find where the user is a FOLLOWER, take the followed's username
        try {
            results = await querySQLDatabase("SELECT u_followed.username FROM users AS u_follower JOIN friends AS f ON \
              u_follower.user_id = f.follower JOIN users AS u_followed ON u_followed.user_id = f.followed \
              WHERE u_follower.user_id = ?;", [currId]);
        } catch (err) {
            console.log("ERROR in getFriends query:",err);
            return res.status(500).json({error: 'Error querying database'});
        }
        res.status(200).json(results);
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
        image_path = await uploadToS3(image, "feed_posts");
    }

    if (!allValid(title, content, parent_id)) {
        return res.status(400).json({error: 'One or more of the fields you entered was empty, please try again.'});
    }

    //note that the mysql js driver converts a null object (like image_path) to NULL 
    let results;
    try {
        results = await querySQLDatabase("INSERT INTO posts (parent_post, title, content, image_link, author_id) VALUES (?, ?, ?, ?, ?);", 
          [parent_id, title, content, image_path, user_id]);
    } catch (err) {
        console.log("ERROR in createPost ", err);
        res.status(500).json({error: 'Error querying database.'});
    }
    return res.status(201).json({message: "Post created."});
}

//we choose to prevent _any_ empty fields, rather than allowing SOME to be empty
function allValid(...args) {
    return args.every(arg => arg?.trim());
}

async function getChatBot() {
  const prompt =
  PromptTemplate.fromTemplate('Given that {context}, answer the following question. {question}');
  const llm = new ChatOpenAI({ modelName: "gpt-3.5-turbo", temperature: 0 });

  const ragChain = RunnableSequence.from([
      {
          context: retriever.pipe(formatDocumentsAsString),
          question: new RunnablePassthrough(),
        },
    prompt,
    llm,
    new StringOutputParser(),
  ]);

  console.log(req.body.question);

  const result = await ragChain.invoke(req.body.question);
  res.status(200).send({message:result});
}

export {
  registerUser,
  registerProfilePicture,
  getChatBot,
  createPost,
  postLogin,
  postLogout,
  getFriends
}