import React, { useEffect, useState } from 'react';
import { useChat } from './ChatContext';

interface ChatInvitesProps {
  onAccept: () => void;
}

const ChatInvites: React.FC<ChatInvitesProps> = ({ onAccept }) => {
  const { invites, loadingInvites, fetchChatInvites, respondToInvite } = useChat();
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    fetchChatInvites();
  }, [fetchChatInvites]);
  
  const handleRespond = async (inviteId: number, accept: boolean) => {
    setError(null);
    try {
      await respondToInvite(inviteId, accept);
      if (accept) {
        onAccept();
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to respond to invitation');
    }
  };
  
  if (loadingInvites) {
    return <div className="loading-spinner">Loading invitations...</div>;
  }
  
  return (
    <div className="chat-invites">
      <h2>Chat Invitations</h2>
      
      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
      
      {invites.length === 0 ? (
        <div className="empty-state">
          <p>You don't have any pending chat invitations.</p>
        </div>
      ) : (
        <ul className="invite-list">
          {(Array.isArray(invites) ? invites : []).map((invite) => (
            <li key={invite.invite_id} className="invite-item">
              <div className="invite-details">
                <div className="chat-name">{invite.chat_name}</div>
                <div className="invite-meta">
                  <span>From: {invite.sender_username}</span>
                  <span className="invite-time">
                    {new Date(invite.sent_at).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="invite-actions">
                <button 
                  className="accept-button"
                  onClick={() => handleRespond(invite.invite_id, true)}
                >
                  Accept
                </button>
                <button 
                  className="reject-button"
                  onClick={() => handleRespond(invite.invite_id, false)}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ChatInvites;