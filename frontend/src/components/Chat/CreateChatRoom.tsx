import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useChat } from './ChatContext';

interface CreateChatRoomProps {
  onCreated: (chatId: number) => void;
}

interface Friend {
  username: string;
  is_online: number;
}

const CreateChatRoom: React.FC<CreateChatRoomProps> = ({ onCreated }) => {
  const [roomName, setRoomName] = useState('');
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { createChatRoom } = useChat();
  
  // Fetch friends list
  useEffect(() => {
    const fetchFriends = async () => {
      try {
        const response = await axios.get('/friends');
        setFriends(response.data);
      } catch (err) {
        console.error('Error fetching friends:', err);
        setError('Failed to load friends list');
      }
    };
    
    fetchFriends();
  }, []);
  
  const handleToggleFriend = (username: string) => {
    setSelectedFriends(prev => 
      prev.includes(username)
        ? prev.filter(friend => friend !== username)
        : [...prev, username]
    );
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!roomName.trim()) {
      setError('Please enter a room name');
      return;
    }
    
    setLoading(true);
    
    try {
      // Call createChatRoom but don't rely on its return value
      await createChatRoom(roomName, selectedFriends);
      
      // Instead, fetch the latest chat rooms
      const response = await axios.get('/chatRooms');
      const rooms = response.data;
      
      if (rooms && rooms.length > 0) {
        // Assume the most recent chat room is the first one
        const mostRecentChat = rooms[0];
        setRoomName('');
        setSelectedFriends([]);
        onCreated(mostRecentChat.chat_id); // Use the ID from the fetched room
      } else {
        throw new Error('Failed to retrieve newly created chat room');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create chat room');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="create-chat-room">
      <h2>Create New Chat Room</h2>
      
      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="roomName">Room Name:</label>
          <input
            type="text"
            id="roomName"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="Enter chat room name"
            required
            disabled={loading}
          />
        </div>
        
        <div className="form-group">
          <label>Select Friends to Invite:</label>
          {friends.length === 0 ? (
            <p className="no-friends">You don't have any friends to invite yet.</p>
          ) : (
            <div className="friends-list">
              {(Array.isArray(friends) ? friends : []).map((friend) => (
                <div key={friend.username} className="friend-option">
                  <input
                    type="checkbox"
                    id={`friend-${friend.username}`}
                    checked={selectedFriends.includes(friend.username)}
                    onChange={() => handleToggleFriend(friend.username)}
                    disabled={loading}
                  />
                  <label htmlFor={`friend-${friend.username}`}>
                    <span 
                      className={`status-dot ${friend.is_online ? 'online' : 'offline'}`}
                    ></span>
                    {friend.username}
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <button 
          type="submit" 
          className="create-button" 
          disabled={loading || !roomName.trim()}
        >
          {loading ? 'Creating...' : 'Create Chat Room'}
        </button>
      </form>
    </div>
  );
};

export default CreateChatRoom;