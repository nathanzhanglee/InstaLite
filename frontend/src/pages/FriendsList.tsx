import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import config from '../../config.json';

interface Friend {
  username: string;
  is_online: number;
  last_online: string;
}

const FriendsList: React.FC = () => {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [newFriendUsername, setNewFriendUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const rootURL = config.serverRootURL;

  // Set up axios to always include credentials and fetch friends on component mount
  useEffect(() => {
    axios.defaults.withCredentials = true;
    fetchFriends();
    
    // Poll for online status every 30 seconds
    const intervalId = setInterval(fetchFriends, 30000);
    
    // Clean up interval on unmount
    return () => clearInterval(intervalId);
  }, []);

  const fetchFriends = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${rootURL}/getFriends`, { 
        withCredentials: true 
      });
      console.log('Friends response:', response.data);
      setFriends(response.data);
    } catch (error) {
      console.error('Error fetching friends:', error);
      toast.error('Failed to load friends list');
    } finally {
      setLoading(false);
    }
  };

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFriendUsername.trim()) return;
    
    try {
      await axios.post(`${rootURL}/addFriend`, { friendUsername: newFriendUsername }, { 
        withCredentials: true 
      });
      toast.success(`Added ${newFriendUsername} as a friend`);
      setNewFriendUsername('');
      fetchFriends();
    } catch (error: any) {
      console.error('Error adding friend:', error);
      toast.error(error.response?.data?.error || 'Failed to add friend');
    }
  };

  const handleRemoveFriend = async (username: string) => {
    try {
      await axios.post(`${rootURL}/removeFriend`, { friendUsername: username }, { 
        withCredentials: true 
      });
      toast.success(`Removed ${username} from friends`);
      fetchFriends();
    } catch (error: any) {
      console.error('Error removing friend:', error);
      toast.error(error.response?.data?.error || 'Failed to remove friend');
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Friends</h1>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Add a Friend</h2>
        <form onSubmit={handleAddFriend} className="flex gap-2">
          <input
            type="text"
            value={newFriendUsername}
            onChange={(e) => setNewFriendUsername(e.target.value)}
            placeholder="Enter username"
            className="flex-grow p-2 border rounded"
          />
          <button 
            type="submit" 
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Add Friend
          </button>
        </form>
      </div>
      
      <div>
        <h2 className="text-xl font-semibold mb-4">Your Friends</h2>
        {loading ? (
          <p>Loading friends...</p>
        ) : friends.length === 0 ? (
          <p>You don't have any friends yet. Add some above!</p>
        ) : (
          <ul className="space-y-2">
            {friends.map((friend) => (
              <li 
                key={friend.username}
                className="flex items-center justify-between bg-white p-3 rounded shadow"
              >
                <div className="flex items-center gap-2">
                  {/* Online status indicator */}
                  <span 
                    className={`inline-block w-3 h-3 rounded-full ${
                      friend.is_online ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                    title={friend.is_online ? 'Online' : `Last seen: ${new Date(friend.last_online).toLocaleString()}`}
                  ></span>
                  <span className="font-medium">{friend.username}</span>
                  {friend.is_online && (
                    <span className="text-xs text-green-500 font-medium">Online</span>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveFriend(friend.username)}
                  className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default FriendsList;