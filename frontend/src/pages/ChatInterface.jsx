import React from 'react';
import ChatGroup from '../components/Chat/ChatGroup';
import './ChatInterface.css';

const ChatInterface = () => {
  return (
    <div className="login-container">
      <h1 className="welcome-title">Pennstagram Chat</h1>
      <div className="login-form">
        <div className="w-full h-[80%] flex flex-col">
          <ChatGroup />
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
