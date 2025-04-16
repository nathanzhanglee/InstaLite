import React from 'react';
import { useParams } from 'react-router-dom';
import ChatGroup from '../components/Chat/ChatGroup';
import './ChatInterface.css';

const ChatInterface = () => {
  const { username } = useParams();

  return (
    <div className="login-container">
      <h1 className="welcome-title">Pennstagram Chat</h1>
      <div className="login-form">
        <div className="login-title">Chat as {username}</div>
        <div className="w-full h-[80%] flex flex-col">
          <ChatGroup username={username} />
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
