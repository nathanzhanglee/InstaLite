import {get_db_connection} from '../models/rdbms.js';
import ChromaDB from '../models/vector.js';
import S3 from '../models/s3.js';
import FaceEmbed from '../models/face_embed.js';
import {v4 as uuidv4} from 'uuid';
import fs from 'fs';

const configFile = fs.readFileSync('backend/config/config.json', 'utf8');
const config = JSON.parse(configFile);

//establish connections and initialize
const mysql_db = get_db_connection();
const chroma_db = ChromaDB();
const s3_db = new S3(config.s3BucketName);
const face = new FaceEmbed();


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

  //parse birthday here if not, whether as JSON or string...

  if ([username, email, first_name, last_name, password, birthday, affiliation].some(field => field === undefined)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const usernameMatches = await querySQLDatabase(`SELECT COUNT(*) AS ucount FROM users WHERE username = ?`, [username]);

  if (usernameMatches[0].ucount > 0) {
    return res.status(400).json({ error: 'Username already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10, (err, hash) => {
    if (err) {
        reject(err);
    } else {
        resolve(hash);
    }
  });

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

  const profilePic = req.file; // multer either stores the binary file in req.file or req.file.buffer 

  if (!profilePic) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const fileExtension = req.file.originalname.split('.').pop(); //gets the file extension by splitting by . and taking last element
  const fileName = `profile-pics/${Date.now()}-${uuidv4()}${fileExtension}`; //scalability: use uuid + time to avoid name collisions

  const s3_path = await s3_db.uploadBuffer(profilePic.buffer, fileName, profilePic.mimetype);

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
  return res.status(200).json({ message: 'Profile picture added successfully', top_matches });
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
  getChatBot
}