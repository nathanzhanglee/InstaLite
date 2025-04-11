import React from 'react';
import ChatRoom from '../components/Chat/ChatRoom';

const ChatInterface = () => {
  return (
    <div className="h-screen w-screen flex flex-col items-center bg-white">
      <h1 className="text-2xl font-bold py-4">Pennstagram Chat</h1>
      <div className="w-full max-w-2xl h-[80%] border">
        <ChatRoom />
      </div>
    </div>
  );
};

export default ChatInterface;
