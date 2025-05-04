import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import config from '../../config.json';

interface Friend {
  username: string;
  is_online: number;
  last_online: string;
  profile_pic_link?: string;
}

const FriendsList: React.FC = () => {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [newFriendUsername, setNewFriendUsername] = useState('');
  const [addFriendStatus, setAddFriendStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const socketRef = useRef<Socket | null>(null);
  
  useEffect(() => {
    // Initial load of friends
    fetchFriends();
    
    // Connect to WebSocket
    socketRef.current = io(config.serverRootURL, { withCredentials: true });
    
    // Listen for friend status updates
    socketRef.current.on('friend-status-change', (updatedFriend) => {
      setFriends(prevFriends => 
        prevFriends.map(friend => 
          friend.username === updatedFriend.username ? updatedFriend : friend
        )
      );
    });
    
    // Add polling as backup (10 second interval)
    const intervalId = setInterval(fetchFriends, 10000);
    
    return () => {
      socketRef.current?.disconnect();
      clearInterval(intervalId);
    };
  }, []);

  const fetchFriends = async () => {
    try {
      const response = await fetch(`${config.serverRootURL}/getFriends`, { 
        credentials: 'include' 
      });
      const data = await response.json();
      console.log('Friends response:', data);
      setFriends(data);
    } catch (error) {
      console.error('Error fetching friends:', error);
    }
  };

  const addFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFriendUsername.trim()) return;
    
    try {
      setAddFriendStatus(null);
      const response = await fetch(`${config.serverRootURL}/addFriend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ friendUsername: newFriendUsername }),
      });
      
      const result = await response.json();
      
      if (response.ok) {
        // Refresh friends list
        fetchFriends();
        setNewFriendUsername('');
        setAddFriendStatus({ type: 'success', message: 'Friend added successfully!' });
      } else {
        setAddFriendStatus({ type: 'error', message: result.error || 'Failed to add friend' });
      }
    } catch (error) {
      console.error('Error adding friend:', error);
      setAddFriendStatus({ type: 'error', message: 'An error occurred while adding friend' });
    }
  };

  const removeFriend = async (username: string) => {
    if (window.confirm(`Are you sure you want to remove ${username} from your friends?`)) {
      try {
        const response = await fetch(`${config.serverRootURL}/removeFriend`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ friendUsername: username }),
        });
        
        if (response.ok) {
          // Remove friend from local state
          setFriends(friends.filter(friend => friend.username !== username));
        } else {
          console.error('Failed to remove friend');
        }
      } catch (error) {
        console.error('Error removing friend:', error);
      }
    }
  };

  const getInitial = (username: string) => {
    return username.charAt(0).toUpperCase();
  };

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Friends</h1>
      
      {/* Add friend form */}
      <div className="mb-6 bg-white p-4 rounded shadow">
        <h2 className="text-xl font-semibold mb-3">Add Friend</h2>
        <form onSubmit={addFriend} className="flex gap-2">
          <input
            type="text"
            value={newFriendUsername}
            onChange={(e) => setNewFriendUsername(e.target.value)}
            placeholder="Enter username"
            className="flex-grow px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
          <button 
            type="submit"
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Add
          </button>
        </form>
        
        {addFriendStatus && (
          <div className={`mt-2 text-sm ${addFriendStatus.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            {addFriendStatus.message}
          </div>
        )}
      </div>
      
      <div>
        <h2 className="text-xl font-semibold mb-4">Your Friends</h2>
        {friends.length === 0 ? (
          <p>You don't have any friends yet. Add some above!</p>
        ) : (
          <ul className="space-y-2">
            {friends.map((friend) => (
              <li 
                key={friend.username}
                className="flex items-center justify-between bg-white p-3 rounded shadow"
              >
                <div className="flex items-center gap-3">
                  {/* Profile picture or initial fallback */}
                  {friend.profile_pic_link ? (
                    <img 
                      src={friend.profile_pic_link}
                      alt={`${friend.username}'s profile`}
                      className="w-10 h-10 rounded-full object-cover"
                      onError={(e) => {
                        // If image fails to load, replace with initial
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        // Check if nextSibling exists and is an HTMLElement before accessing classList
                        if (target.nextSibling && target.nextSibling instanceof HTMLElement) {
                          target.nextSibling.classList.remove('hidden');
                        }
                      }}
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-medium">
                      {getInitial(friend.username)}
                    </div>
                  )}
                  
                  {/* Username and online status */}
                  <div>
                    <span className="font-medium">{friend.username}</span>
                    <span className={`text-xs font-medium ml-2 ${friend.is_online ? 'text-green-500' : 'text-gray-500'}`}>
                      {friend.is_online ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
                
                {/* Remove friend button */}
                <button 
                  onClick={() => removeFriend(friend.username)}
                  className="text-sm text-red-500 hover:text-red-700 font-medium"
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