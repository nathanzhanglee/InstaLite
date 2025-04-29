import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import config from '../../config.json';

interface Friend {
  username: string;
  is_online: number;
  last_online: string;
}

const FriendsList: React.FC = () => {
  const [friends, setFriends] = useState<Friend[]>([]);
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

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Friends</h1>
      
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default FriendsList;