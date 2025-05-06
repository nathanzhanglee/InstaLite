import { get_db_connection } from './rdbms.js';

// Database connection setup
const dbaccess = get_db_connection();

/**
 * Deletes the tables in the database, except for `names`.
 * @param {*} nameArray the names of the tables to drop
 */
async function delete_tables(nameArray) {
    for (const name of nameArray) {
        try {
            const query = `DROP TABLE IF EXISTS ${name};`;
            await dbaccess.send_sql(query, []);
            console.log(`Table '${name}' deleted`);
        } catch (err) {
            console.error(`Error deleting table ${name}:`, err);
        }
    }
    return null;
}

console.log('Deleting tables');

async function delete_fn() {
  await dbaccess.connect();
  await delete_tables([
    'likes',
    'hashtags',
    'post_rankings',
    'posts',
    'chat_invites',
    'chat_messages',
    'chat_members',
    'chat_rooms',
    'sessions',
    'friend_requests',
    'friends',
    'recommendations',
    'users',
  ]);
}

delete_fn().then(() => {
  console.log('Done');
  dbaccess.close();
}).catch((err) => {
  console.error(err);
  dbaccess.close();
}
).finally(() => {
  process.exit(0);
});

