import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    methods: ["GET", "POST"]
  }
});

const roomUsers = new Map();

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // Join default room
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
    
    // Send to everyone in the room
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

const PORT = 8080;
server.listen(PORT, () => {
  console.log(`Server running on ws://localhost:${PORT}`);
});