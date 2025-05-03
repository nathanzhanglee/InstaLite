import React, { useState, useEffect, useRef } from 'react';
import { useChat } from './ChatContext';
import MessageInput from './MessageInput';

interface ChatRoomProps {
  chatId: number;
  onBack: () => void;
}

const ChatRoom: React.FC<ChatRoomProps> = ({ chatId, onBack }) => {
  const { 
    activeChatId, 
    activeChatName, 
    activeChatMembers, 
    messages, 
    loadingMessages,
    setActiveChatId,
    sendMessage,
    sendChatInvite,
    leaveChat,
    loadMoreMessages
  } = useChat();
  
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteUsername, setInviteUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [page, setPage] = useState(1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  
  // Set the active chat when this component mounts
  useEffect(() => {
    setActiveChatId(chatId);
    
    return () => {
      // Clear active chat when component unmounts
      setActiveChatId(null);
    };
  }, [chatId, setActiveChatId]);
  
  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isNearBottom]);
  
  // Handle scrolling
  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setIsNearBottom(scrollHeight - scrollTop - clientHeight < 100);
      
      // Check if user has scrolled to the top and isn't already loading
      if (scrollTop === 0 && !loadingOlder) {
        loadOlderMessages();
      }
    }
  };

  // Load older messages
  const loadOlderMessages = async () => {
    if (loadingOlder) return;
    
    setLoadingOlder(true);
    try {
      await loadMoreMessages(chatId, page + 1);
      setPage(prev => prev + 1);
    } catch (error) {
      console.error("Failed to load older messages:", error);
    } finally {
      setLoadingOlder(false);
    }
  };

  // Handle sending a message
  const handleSendMessage = (content: string) => {
    if (content.trim()) {
      sendMessage(content);
    }
  };
  
  // Handle leaving the chat
  const handleLeaveChat = async () => {
    if (window.confirm('Are you sure you want to leave this chat?')) {
      try {
        await leaveChat(chatId);
        onBack();
      } catch (error) {
        setError('Failed to leave chat. Please try again.');
      }
    }
  };
  
  // Handle sending an invitation
  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!inviteUsername.trim()) {
      setError('Please enter a username');
      return;
    }
    
    try {
      await sendChatInvite(chatId, inviteUsername);
      setInviteUsername('');
      setShowInviteForm(false);
      alert(`Invitation sent to ${inviteUsername}`);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to send invitation');
    }
  };
  
  if (activeChatId !== chatId) {
    return <div className="loading-spinner">Loading chat room...</div>;
  }
  
  return (
    <div className="chat-room">
      <div className="chat-header">
        <h2>{activeChatName || 'Chat Room'}</h2>
        <div className="chat-actions">
          <button 
            className="invite-button"
            onClick={() => setShowInviteForm(!showInviteForm)}
          >
            {showInviteForm ? 'Cancel Invite' : 'Invite Friend'}
          </button>
          <button 
            className="leave-button"
            onClick={handleLeaveChat}
          >
            Leave Chat
          </button>
        </div>
      </div>
      
      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
      
      {showInviteForm && (
        <div className="invite-form-container">
          <form onSubmit={handleSendInvite}>
            <input
              type="text"
              placeholder="Enter username to invite"
              value={inviteUsername}
              onChange={(e) => setInviteUsername(e.target.value)}
              required
            />
            <button type="submit">Send Invite</button>
          </form>
        </div>
      )}
      
      <div className="chat-layout">
        <div 
          ref={messagesContainerRef}
          className="messages-container" 
          style={{ maxHeight: "500px", overflow: "auto" }}
          onScroll={handleScroll}
        >
          {loadingOlder && (
            <div className="loading-older-messages">
              Loading older messages...
            </div>
          )}
          {loadingMessages ? (
            <div className="loading-messages">Loading messages...</div>
          ) : (
            <div className="message-list">
              {messages.map((msg) => (
                <div 
                  key={`${msg.message_id}-${msg.sender_id}-${msg.sent_at}`}
                  className={`message-bubble ${
                    msg.sender_id === -1 ? 'system-message' :
                    activeChatMembers.find(m => m.user_id === msg.sender_id)?.username === 
                    localStorage.getItem('username') ? 'sent' : 'received'
                  }`}
                >
                  {msg.sender_id === -1 ? (
                    // System message
                    <div className="system-message-content">{msg.content}</div>
                  ) : (
                    // Regular message
                    <>
                      <div className="message-header">
                        <span className="sender-name">{msg.sender_username}</span>
                        <span className="message-time">
                          {new Date(msg.sent_at).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </span>
                      </div>
                      <div className="message-content">{msg.content}</div>
                    </>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
          <MessageInput onSend={handleSendMessage} />
        </div>
        
        <div className="chat-sidebar">
          <h3 className="sidebar-title">Chat Members ({activeChatMembers.length})</h3>
          <ul className="member-list">
            {activeChatMembers.map((member) => (
              <li 
                key={`member-${member.user_id}`} 
                className={`member-item ${member.is_online ? 'online' : 'offline'}`}
              >
                <div className="member-avatar">
                  {member.profile_pic_link ? (
                    <img src={member.profile_pic_link} alt={member.username} className="avatar-image" />
                  ) : (
                    <div className="default-avatar">
                      {member.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className={`status-dot ${member.is_online ? 'online' : 'offline'}`}></span>
                </div>
                <span className="member-username">{member.username}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ChatRoom;