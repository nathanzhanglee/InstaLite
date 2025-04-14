import { get_db_connection } from './rdbms.js';

// Database connection setup
const dbaccess = get_db_connection();

//the max length of a message, in characters (based on Discord limits)
const max_message_length = 3000; 

async function create_tables() {

  //assumes that we have a names imdb table available with data, as per Ed #591
  //an easy way to move it over is by running the following commands in the terminal:
  //mysqldump imdb_basic names > names_table_dump.sql
  //mysql instalite < names_table_dump.sql

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

  //recommendations table: contains personal recommendation info, to be populated by algorithm
  await dbaccess.create_tables('CREATE TABLE IF NOT EXISTS recommendations ( \
      person INT, \
      recommendation INT, \
      strength INT, \
      FOREIGN KEY (person) REFERENCES users(user_id), \
      FOREIGN KEY (recommendation) REFERENCES users(user_id) \
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

  //chat member table: contains members in each chat, has a separate row for each user in the chat
  await dbaccess.create_tables('CREATE TABLE IF NOT EXISTS chat_members ( \
    chat_id INT NOT NULL AUTO_INCREMENT, \
    user_id INT, \
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, \
    left_at TIMESTAMP NULL DEFAULT NULL, \
    FOREIGN KEY (user_id) REFERENCES users(user_id), \
    PRIMARY KEY(chat_id, user_id) \
    );')
  
  //chat messages table: contains the actual content of chats, 1 row per message
  await dbaccess.create_tables('CREATE TABLE IF NOT EXISTS chat_messages ( \
    chat_id INT, \
    message_id INT NOT NULL AUTO_INCREMENT, \
    sender_id INT NOT NULL, \
    content VARCHAR('+ max_message_length + '), \
    file_link VARCHAR(255) DEFAULT NULL, \
    file_type VARCHAR(100) DEFAULT NULL, \
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, \
    FOREIGN KEY (sender_id) REFERENCES users(user_id), \
    FOREIGN KEY (chat_id) REFERENCES chat_members(chat_id), \
    PRIMARY KEY(message_id) \
    );')
  
  //chat invites table: contains pending invites to join a chat
  await dbaccess.create_tables('CREATE TABLE IF NOT EXISTS chat_invites ( \
    invite_id INT NOT NULL AUTO_INCREMENT, \
    chat_id INT NOT NULL, \
    recipient_id INT NOT NULL, \
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, \
    accepted_at TIMESTAMP NULL DEFAULT NULL, \
    FOREIGN KEY (chat_id) REFERENCES chat_members(chat_id), \
    FOREIGN KEY (recipient_id) REFERENCES users(user_id), \
    PRIMARY KEY(invite_id) \
    );')
  
  //posts table for public area/feed: contains post information, including S3 link to any image
  await dbaccess.create_tables('CREATE TABLE IF NOT EXISTS posts ( \
    post_id INT NOT NULL AUTO_INCREMENT, \
    parent_post INT, \
    title VARCHAR(255), \
    content VARCHAR(255), \
    author_id INT, \
    image_link VARCHAR(255) DEFAULT NULL, \
    FOREIGN KEY (author_id) REFERENCES users(user_id), \
    FOREIGN KEY (parent_post) REFERENCES posts(post_id), \
    PRIMARY KEY(post_id) \
    );')
  
  //indices are useful for the 'chat-finding' queries
  await dbaccess.send_sql('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);');
  await dbaccess.send_sql('CREATE INDEX IF NOT EXISTS idx_chat_members_user_id_left_at ON chat_members(user_id, left_at);');
  await dbaccess.send_sql('CREATE INDEX IF NOT EXISTS idx_friends_follower_followed ON friends(follower, followed);');
  await dbaccess.send_sql('CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id);');
  await dbaccess.send_sql('CREATE INDEX IF NOT EXISTS idx_chat_messages_sent ON chat_messages(chat_id, sent_at);');

  return null;
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

