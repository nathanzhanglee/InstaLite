import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import register_routes from './routes/register_routes.js';
import session from 'express-session';
import dotenv from 'dotenv';

dotenv.config();
const configFile = fs.readFileSync('./config/config.json', 'utf8');
const config = JSON.parse(configFile);

const app = express();
const port = config.serverPort || 8080;
const host = process.env.SITE_HOST;

// Configure CORS
app.use(cors({
  origin: [host || 'http://localhost:4567', "http://localhost:3000", "http://127.0.0.1:3000", "http://0.0.0.0:4567"],
  methods: ['POST', 'PUT', 'GET', 'OPTIONS', 'HEAD'],
  credentials: true
}));

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
    origin: [host || 'http://localhost:4567', "http://localhost:3000", "http://127.0.0.1:3000"],
    methods: ["GET", "POST"]
  }
});

const roomUsers = new Map();

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
    const room = 'default-room';
    const username = roomUsers.get(room)?.get(socket.id);
    if (username) {
      roomUsers.get(room).delete(socket.id);
      io.to(room).emit('user-left', username);
      updateUserList(room);
    }
  });

  function updateUserList(room) {
    const users = Array.from(roomUsers.get(room)?.values() || []);
    io.to(room).emit('user-list', users);
  }
});

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});