import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import MessageList from './MessageList';
import MessageInput from './MessageInput';

type Message = {
  sender: string;
  content: string;
  timestamp?: string;
};

const ChatGroup: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [username, setUsername] = useState('');
  const [users, setUsers] = useState<string[]>([]);
  const socketRef = useRef<Socket>();

  useEffect(() => {
    const randomUsername = `user${Math.floor(Math.random() * 1000)}`;
    setUsername(randomUsername);

    socketRef.current = io('http://localhost:8080', {
      transports: ['websocket'],
      upgrade: false,
      forceNew: true
    });

    // default room
    socketRef.current.emit('join', randomUsername);

    // event listeners
    socketRef.current.on('receive-message', (message: Message) => {
      setMessages((prev) => [...prev, message]);
    });

    socketRef.current.on('user-joined', (username: string) => {
      setMessages((prev) => [...prev, {
        sender: 'system',
        content: `${username} joined the chat`,
        timestamp: new Date().toISOString()
      }]);
    });

    socketRef.current.on('user-left', (username: string) => {
      setMessages((prev) => [...prev, {
        sender: 'system',
        content: `${username} left the chat`,
        timestamp: new Date().toISOString()
      }]);
    });

    socketRef.current.on('user-list', (userList: string[]) => {
      setUsers(userList);
    });

    // unmount cleanup for socket
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const handleSend = (content: string) => {
    if (!socketRef.current || !content.trim()) return;
    socketRef.current.emit('send-message', content);
  };

  return (
    <div className="w-full h-full flex flex-col border">
      <div className="p-2 bg-gray-100 border-b flex justify-between">
        <div>
          <span className="font-semibold">Room: </span>
          <span className="text-blue-600">public-chat</span>
          <span className="ml-4 font-semibold">User: </span>
          <span className="text-green-600">{username}</span>
        </div>
        <div>
          <span className="font-semibold">Online: </span>
          <span className="text-purple-600">{users.length}</span>
        </div>
      </div>
      <MessageList messages={messages} />
      <MessageInput onSend={handleSend} />
    </div>
  );
};

export default ChatGroup;