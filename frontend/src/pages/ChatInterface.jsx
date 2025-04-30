import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ChatProvider } from '../components/Chat/ChatContext';
import ChatRoomsList from '../components/Chat/ChatRoomsList';
import ChatRoom from '../components/Chat/ChatRoom';
import ChatInvites from '../components/Chat/ChatInvites';
import CreateChatRoom from '../components/Chat/CreateChatRoom';
import './ChatInterface.css';

const ChatInterface = () => {
  const { username } = useParams();
  const [activeView, setActiveView] = useState('rooms');
  const [activeChatId, setActiveChatId] = useState(null);

  return (
    <ChatProvider>
      <div className="chat-interface-container">
        <h1 className="welcome-title">Pennstagram Chat</h1>
        
        <div className="chat-navigation">
          <button 
            className={`nav-button ${activeView === 'rooms' ? 'active' : ''}`} 
            onClick={() => { setActiveView('rooms'); setActiveChatId(null); }}
          >
            My Chats
          </button>
          <button 
            className={`nav-button ${activeView === 'invites' ? 'active' : ''}`}
            onClick={() => { setActiveView('invites'); setActiveChatId(null); }}
          >
            Invitations
          </button>
          <button 
            className={`nav-button ${activeView === 'create' ? 'active' : ''}`}
            onClick={() => { setActiveView('create'); setActiveChatId(null); }}
          >
            Create Chat
          </button>
          {activeView === 'chat' && (
            <button 
              className="nav-button back-button"
              onClick={() => { setActiveView('rooms'); setActiveChatId(null); }}
            >
              ← Back to Chats
            </button>
          )}
        </div>
        
        <div className="chat-content">
          {activeView === 'rooms' && (
            <ChatRoomsList
              onSelectRoom={(chatId) => {
                setActiveChatId(chatId);
                setActiveView('chat');
              }}
            />
          )}
          
          {activeView === 'chat' && activeChatId && (
            <ChatRoom 
              chatId={activeChatId}
              onBack={() => {
                setActiveView('rooms');
                setActiveChatId(null);
              }}
            />
          )}
          
          {activeView === 'invites' && (
            <ChatInvites
              onAccept={() => {
                setActiveView('rooms');
              }}
            />
          )}
          
          {activeView === 'create' && (
            <CreateChatRoom
              onCreated={(chatId) => {
                setActiveChatId(chatId);
                setActiveView('chat');
              }}
            />
          )}
        </div>
      </div>
    </ChatProvider>
  );
};

export default ChatInterface;