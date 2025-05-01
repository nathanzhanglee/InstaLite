import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import register_routes from './routes/register_routes.js';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { get_db_connection } from './models/rdbms.js';

dotenv.config();
const configFile = fs.readFileSync('./config/config.json', 'utf8');
const config = JSON.parse(configFile);

const app = express();
const port = config.serverPort || 8080;
const host = process.env.SITE_HOST;

// Configure CORS
app.use(cors({
  origin: [host || 'http://localhost:4567', "http://localhost:3000", 'http://127.0.0.1:4567', "http://127.0.0.1:3000", "http://0.0.0.0:4567"],
  methods: ['POST', 'PUT', 'GET', 'OPTIONS', 'HEAD'],
  credentials: true
}));

app.use(cookieParser());

// Configure middleware
app.use(express.json());
app.use(session({
  secret: 'nets2120_insecure', 
  saveUninitialized: true, 
  cookie: { httpOnly: false }, 
  resave: true
}));

register_routes(app);

const server = createServer(app);

// socket.io for chat interface
const io = new Server(server, {
  cors: {
    origin: [host || 'http://localhost:4567', "http://localhost:3000", "http://127.0.0.1:3000", "http://127.0.0.1:4567"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

const dbaccess = get_db_connection();

const querySQLDatabase = async (query, params = []) => {
  try {
    return await dbaccess.send_sql(query, params);
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

const roomUsers = new Map();
const userSockets = new Map();

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  socket.join('default-room');
  
  socket.on('join', (username) => {
    // Add user to room tracking
    if (!roomUsers.has('default-room')) {
      roomUsers.set('default-room', new Map());
    }
    roomUsers.get('default-room').set(socket.id, username);
    
    // Notify room
    io.to('default-room').emit('user-joined', username);
    updateUserList('default-room');
  });

  socket.on('send-message', (message) => {
    const username = roomUsers.get('default-room')?.get(socket.id);
    if (!username) return;
    
    const messageData = {
      sender: username,
      content: message,
      timestamp: new Date().toISOString()
    };
    
    io.to('default-room').emit('receive-message', messageData);
  });

  socket.on('disconnect', () => {
    // Existing chat room code
    const room = 'default-room';
    const username = roomUsers.get(room)?.get(socket.id);
    if (username) {
      roomUsers.get(room).delete(socket.id);
      io.to(room).emit('user-left', username);
      updateUserList(room);
    }
    
    // Find which user this socket belongs to
    for (const [userId, userSocket] of userSockets.entries()) {
      if (userSocket === socket) {
        // Remove from userSockets map
        userSockets.delete(userId);
        
        // Update last_online in database
        querySQLDatabase(
          "UPDATE users SET last_online = CURRENT_TIMESTAMP WHERE user_id = ?", 
          [userId]
        );
        
        // Notify friends that user is offline
        querySQLDatabase(
          "SELECT follower FROM friends WHERE followed = ?",
          [userId]
        ).then(friends => {
          friends.forEach(friend => {
            const friendSocket = userSockets.get(friend.follower);
            if (friendSocket) {
              friendSocket.emit('friend-status-change', {
                username: userId,
                is_online: 0,
                last_online: new Date().toISOString()
              });
            }
          });
        });
        
        break;
      }
    }
  });

  function updateUserList(room) {
    const users = Array.from(roomUsers.get(room)?.values() || []);
    io.to(room).emit('user-list', users);
  }
  
  // Inside the socket.io connection handler
  socket.on('login', async (userId) => {
    // Store user socket mapping
    userSockets.set(userId, socket);
    
    // Get user's friends
    const friends = await querySQLDatabase(
      "SELECT follower FROM friends WHERE followed = ?",
      [userId]
    );
    
    // Notify friends that user is online
    friends.forEach(friend => {
      const friendSocket = userSockets.get(friend.follower);
      if (friendSocket) {
        friendSocket.emit('friend-status-change', {
          username: userId,
          is_online: 1,
          last_online: new Date().toISOString()
        });
      }
    });
  });

  // Join a specific chat room
  socket.on('joinRoom', async (room) => {
    // Leave previous rooms (except the user's personal room)
    for (const [roomName, _] of socket.rooms.entries()) {
      if (roomName !== socket.id && roomName.startsWith('chat-')) {
        socket.leave(roomName);
      }
    }
    
    socket.join(room);
    console.log(`Socket ${socket.id} joined room: ${room}`);
    
    // Add this line to emit the joinedRoom event back to client
    socket.emit('joinedRoom', room);
    
    // Get user ID from session if available
    const userId = socket.handshake.auth.userId || socket.request?.session?.user_id;
    if (userId) {
      try {
        // Check if user is already in the room members list in the database
        const chatId = room.replace('chat-', '');
        const isMember = (await querySQLDatabase(
          "SELECT COUNT(*) AS count FROM chat_members WHERE chat_id = ? AND user_id = ?",
          [chatId, userId]
        ))[0][0].count > 0;
        
        // Only notify about joining if the user is a valid member
        if (isMember) {
          const userInfo = (await querySQLDatabase(
            "SELECT username FROM users WHERE user_id = ?",
            [userId]
          ))[0][0];
          
          if (userInfo) {
            // Broadcast to room that user has joined
            socket.to(room).emit('userJoinedChat', {
              userId: userId,
              username: userInfo.username
            });
          }
        }
      } catch (err) {
        console.error("Error checking room membership:", err);
      }
    }
  });
  
  // Leave a specific chat room
  socket.on('leaveRoom', (room) => {
    socket.leave(room);
    console.log(`Socket ${socket.id} left room: ${room}`);
  });
  
  // Send a message to a chat room
  socket.on('sendMessage', async (data) => {
    const { chatId, content, tempId } = data;
    const userId = socket.handshake.auth.userId || socket.request?.session?.user_id;
    if (!userId || !chatId || !content) {
      return;
    }

    try {
      // Verify user is a member of the chat
      const isMember = (await querySQLDatabase(
        "SELECT COUNT(*) AS count FROM chat_members WHERE chat_id = ? AND user_id = ?",
        [chatId, userId]
      ))[0][0].count > 0;
      
      if (!isMember) {
        // Notify sender of error
        socket.emit('messageError', {
          tempId,
          error: 'You are not a member of this chat'
        });
        return;
      }
      
      // Insert message into database
      const result = await querySQLDatabase(
        "INSERT INTO chat_messages (chat_id, sender_id, content) VALUES (?, ?, ?)",
        [chatId, userId, content]
      );
      
      const messageId = result[0].insertId;
      
      // Get sender info
      const sender = (await querySQLDatabase(
        "SELECT username, profile_pic_link FROM users WHERE user_id = ?",
        [userId]
      ))[0][0];
      
      const messageData = {
        message_id: messageId,
        sender_id: userId,
        sender_username: sender.username,
        sender_profile_pic: sender.profile_pic_link,
        content: content,
        sent_at: new Date().toISOString(),
        chatId: parseInt(chatId),
        tempId // Include temporary ID for client-side reconciliation
      };
      
      // Broadcast to all clients in the room, including sender
      console.log(`Broadcasting message to room: chat-${chatId}, from user: ${userId}, content: ${content.substring(0, 20)}...`);
      io.to(`chat-${chatId}`).emit('receiveMessage', messageData);
      
    } catch (err) {
      console.error("Error sending message via socket:", err);
      socket.emit('messageError', {
        tempId,
        error: 'Failed to send message'
      });
    }
  });
});

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});