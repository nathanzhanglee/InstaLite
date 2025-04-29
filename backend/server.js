import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import register_routes from './routes/register_routes.js';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

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
    methods: ["GET", "POST"]
  }
});

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
});

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});