import fs from 'fs';
import { get_db_connection } from './rdbms.js';

// Database connection setup
const dbaccess = get_db_connection();
// Simple approach to determine config file path
const configPath = fs.existsSync('./config/config.json') 
  ? './config/config.json'           // Running from backend folder
  : 'backend/config/config.json';    // Running from root folder
const configFile = fs.readFileSync(configPath, 'utf8');
const config = JSON.parse(configFile);

//the max length of a message, in characters (based on Discord limits)
const max_message_length = config.socialParams.chatMessageMaxLength; 
const max_post_length = config.socialParams.postMaxLength;

async function create_tables() {

  ////////////////// USER TABLES //////////////////
  //user table: contains personal info and profile picture
  await dbaccess.create_tables('CREATE TABLE IF NOT EXISTS users ( \
    user_id INT NOT NULL AUTO_INCREMENT, \
    username VARCHAR(30) NOT NULL, \
    email VARCHAR(255), \
    first_name VARCHAR(50), \
    last_name VARCHAR(50), \
    birthday DATE, \
    affiliation VARCHAR(255), \
    profile_pic_link VARCHAR(255), \
    hashed_password VARCHAR(255) NOT NULL, \
    last_online TIMESTAMP DEFAULT CURRENT_TIMESTAMP, \
    linked_actor VARCHAR(255) DEFAULT NULL, \
    FOREIGN KEY (linked_actor) REFERENCES names(nconst), \
    PRIMARY KEY(user_id) \
    );')
  
  //user sessions table: contains session info for each user
  await dbaccess.create_tables('CREATE TABLE IF NOT EXISTS sessions ( \
    session_id INT NOT NULL AUTO_INCREMENT, \
    user_id INT NOT NULL, \
    session_token VARCHAR(255) NOT NULL, \
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, \
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL 7 DAY), \
    FOREIGN KEY (user_id) REFERENCES users(user_id), \
    PRIMARY KEY(session_id) \
    );')

  //recommendations table: contains personal recommendation info, to be populated by algorithm
  await dbaccess.create_tables('CREATE TABLE IF NOT EXISTS recommendations ( \
      person INT, \
      recommendation INT, \
      strength INT, \
      FOREIGN KEY (person) REFERENCES users(user_id), \
      FOREIGN KEY (recommendation) REFERENCES users(user_id) \
      );')
  
  await dbaccess.create_tables('CREATE TABLE IF NOT EXISTS friend_requests ( \
      friend_request_id INT NOT NULL AUTO_INCREMENT, \
      sender_id INT NOT NULL, \
      recipient_id INT NOT NULL, \
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, \
      status ENUM(\'pending\', \'accepted\', \'rejected\') DEFAULT \'pending\', \
      FOREIGN KEY (sender_id) REFERENCES users(user_id), \
      FOREIGN KEY (recipient_id) REFERENCES users(user_id), \
      PRIMARY KEY (friend_request_id) \
      );')
  
  //friends table: contains current friend status
  await dbaccess.create_tables('CREATE TABLE IF NOT EXISTS friends ( \
    followed INT, \
    follower INT, \
    FOREIGN KEY (follower) REFERENCES users(user_id), \
    FOREIGN KEY (followed) REFERENCES users(user_id), \
    PRIMARY KEY (follower, followed) \
    );')
  
  ////////////////// CHAT TABLES //////////////////

  //chat rooms table: contains information about each chat room
  await dbaccess.create_tables('CREATE TABLE IF NOT EXISTS chat_rooms ( \
    chat_id INT NOT NULL AUTO_INCREMENT, \
    name VARCHAR(100) NOT NULL, \
    created_by INT NOT NULL, \
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, \
    FOREIGN KEY (created_by) REFERENCES users(user_id), \
    PRIMARY KEY(chat_id) \
    );')

  //chat member table: contains members in each chat, has a separate row for each user in the chat
  await dbaccess.create_tables('CREATE TABLE IF NOT EXISTS chat_members ( \
    chat_id INT NOT NULL, \
    user_id INT NOT NULL, \
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, \
    left_at TIMESTAMP NULL DEFAULT NULL, \
    FOREIGN KEY (user_id) REFERENCES users(user_id), \
    FOREIGN KEY (chat_id) REFERENCES chat_rooms(chat_id) ON DELETE CASCADE, \
    PRIMARY KEY(chat_id, user_id) \
    );')
  
  //chat messages table: contains the actual content of chats, 1 row per message
  await dbaccess.create_tables('CREATE TABLE IF NOT EXISTS chat_messages ( \
    message_id BIGINT NOT NULL AUTO_INCREMENT, \
    chat_id INT NOT NULL, \
    sender_id INT NOT NULL, \
    content VARCHAR('+ max_message_length + '), \
    file_link VARCHAR(255) DEFAULT NULL, \
    file_type VARCHAR(100) DEFAULT NULL, \
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, \
    FOREIGN KEY (sender_id) REFERENCES users(user_id), \
    FOREIGN KEY (chat_id) REFERENCES chat_rooms(chat_id) ON DELETE CASCADE, \
    PRIMARY KEY(message_id) \
    );')
  
  //chat invites table: contains pending invites to join a chat
  await dbaccess.create_tables('CREATE TABLE IF NOT EXISTS chat_invites ( \
    invite_id INT NOT NULL AUTO_INCREMENT, \
    chat_id INT NOT NULL, \
    recipient_id INT NOT NULL, \
    sender_id INT NOT NULL, \
    status ENUM(\'pending\', \'accepted\', \'rejected\') DEFAULT \'pending\', \
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, \
    responded_at TIMESTAMP DEFAULT NULL, \
    FOREIGN KEY (chat_id) REFERENCES chat_rooms(chat_id) ON DELETE CASCADE, \
    FOREIGN KEY (sender_id) REFERENCES users(user_id), \
    FOREIGN KEY (recipient_id) REFERENCES users(user_id), \
    UNIQUE KEY (chat_id, recipient_id), \
    PRIMARY KEY(invite_id) \
    );')
  
  //posts table for public area/feed: contains post information, including S3 link to any image
  await dbaccess.create_tables('CREATE TABLE IF NOT EXISTS posts ( \
    post_id BIGINT NOT NULL AUTO_INCREMENT, \
    parent_post BIGINT, \
    title VARCHAR(255), \
    content VARCHAR(' + max_post_length + '), \
    author_username VARCHAR(30), \
    image_link VARCHAR(255) DEFAULT NULL, \
    hashtags VARCHAR(500) DEFAULT NULL, \
    FOREIGN KEY (parent_post) REFERENCES posts(post_id), \
    PRIMARY KEY(post_id) \
    );')

  //post rankings table: contains ranking for each user-post pair so server can find high-ranked
  // posts for a given user.
  // maybe add foreign key
  await dbaccess.create_tables('CREATE TABLE IF NOT EXISTS post_rankings ( \
    user_id INT NOT NULL, \
    post_id BIGINT NOT NULL, \
    weight FLOAT NOT NULL, \
    PRIMARY KEY (user_id, post_id), \
    FOREIGN KEY (user_id) REFERENCES users(user_id), \
    FOREIGN KEY (post_id) REFERENCES posts(post_id) \
    );')

  //hashtags table: links users to the hashtags they've selected as interests when registering.
  await dbaccess.create_tables('CREATE TABLE IF NOT EXISTS hashtags ( \
    user_id INT NOT NULL, \
    hashtag VARCHAR(255), \
    PRIMARY KEY (user_id) \
    );')

  // table to store likes; needed for rankings
  await dbaccess.create_tables('CREATE TABLE IF NOT EXISTS likes ( \
    user_id INT NOT NULL, \
    post_id BIGINT NOT NULL \
    );')
  
  //indices are useful for the 'chat-finding' queries
  // Create each index individually to allow for more flexibility based on edits
  await createIndex('idx_users_username', 'users', 'username');
  await createIndex('idx_chat_members_user_id_left_at', 'chat_members', 'user_id, left_at');
  await createIndex('idx_friends_follower_followed', 'friends', 'follower, followed');
  await createIndex('idx_posts_author_uname', 'posts', 'author_username');
  await createIndex('idx_chat_messages_sent', 'chat_messages', 'chat_id, sent_at');
  await createIndex('idx_chat_invites_invitee', 'chat_invites', 'recipient_id');
  await createIndex('idx_chat_invites_chat', 'chat_invites', 'chat_id');
  await createIndex('idx_sessions_user_id', 'sessions', 'user_id');
  await createIndex('idx_chat_rooms_created_by', 'chat_rooms', 'created_by');
  await createIndex('idx_chat_members_chat_id', 'chat_members', 'chat_id');
  await createIndex('idx_chat_members_user_id', 'chat_members', 'user_id');
  await createIndex('idx_chat_messages_chat_id', 'chat_messages', 'chat_id');
  await createIndex('idx_chat_invites_status', 'chat_invites', 'status');
  await createIndex('idx_friend_req', 'friend_requests', 'sender_id', 'recipient_id');

  return null;
}

async function createIndex(indexName, tableName, columns) {
  try {
    await dbaccess.send_sql(`CREATE INDEX ${indexName} ON ${tableName}(${columns});`);
    console.log(`Index ${indexName} created successfully.`);
  } catch (err) {
    if (err.code === 'ER_DUP_KEYNAME') {
      console.log(`Index ${indexName} already exists; skipping creation.`);
    } else {
      console.error(`Error creating index ${indexName}:`, err);
    }
  }
}

console.log('Creating tables');

async function create_populate() {
  await dbaccess.connect();
  await create_tables();
  console.log('Tables created');
}

create_populate().then(() => {
  console.log('Done');
  dbaccess.close();
}).catch((err) => {
  console.error(err);
  dbaccess.close();
}
).finally(() => {
  process.exit(0);
});

