import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import config from '../../config.json';
import { toast } from 'react-toastify';

interface Friend {
  username: string;
  is_online: number;
  last_online: string;
  profile_pic_link?: string;
}

interface FriendRequest {
  friend_request_id: number;
  sender_username: string;
  sent_at: string;
  profile_pic_link?: string;
}

interface OutgoingRequest {
  friend_request_id: number;
  recipient_username: string;
  sent_at: string;
}

const FriendsList: React.FC = () => {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<OutgoingRequest[]>([]);
  const [newFriendUsername, setNewFriendUsername] = useState('');
  const [addFriendStatus, setAddFriendStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'friends' | 'requests'>('friends');
  const socketRef = useRef<Socket | null>(null);
  
  useEffect(() => {
    // Initial load of friends and requests
    fetchFriends();
    fetchFriendRequests();
    
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
    
    // Listen for new friend requests
    socketRef.current.on('new-friend-request', () => {
      fetchFriendRequests();
      toast.info('You have a new friend request!');
    });
    
    // Add polling as backup (10 second interval)
    const intervalId = setInterval(() => {
      fetchFriends();
      fetchFriendRequests();
    }, 10000);
    
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
      
      if (!response.ok) {
        throw new Error('Failed to fetch friends');
      }
      
      const data = await response.json();
      setFriends(data);
    } catch (error) {
      console.error('Error fetching friends:', error);
      toast.error('Failed to load your friends list');
    }
  };

  const fetchFriendRequests = async () => {
    try {
      // Fetch incoming friend requests
      const incomingResponse = await fetch(`${config.serverRootURL}/getFriendRequests?type=incoming`, {
        credentials: 'include'
      });
      
      if (!incomingResponse.ok) {
        throw new Error('Failed to fetch incoming friend requests');
      }
      
      const incomingData = await incomingResponse.json();
      setIncomingRequests(incomingData);
      
      // Fetch outgoing friend requests
      const outgoingResponse = await fetch(`${config.serverRootURL}/getFriendRequests?type=outgoing`, {
        credentials: 'include'
      });
      
      if (!outgoingResponse.ok) {
        throw new Error('Failed to fetch outgoing friend requests');
      }
      
      const outgoingData = await outgoingResponse.json();
      setOutgoingRequests(outgoingData);
    } catch (error) {
      console.error('Error fetching friend requests:', error);
      toast.error('Failed to load friend requests');
    }
  };

  const sendFriendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFriendUsername.trim()) return;
    
    setAddFriendStatus(null);
    
    try {
      const response = await fetch(`${config.serverRootURL}/sendFriendRequest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ friendUsername: newFriendUsername }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send friend request');
      }
      
      const result = await response.json();
      
      // Refresh friend requests
      fetchFriendRequests();
      setNewFriendUsername('');
      setAddFriendStatus({ type: 'success', message: 'Friend request sent successfully!' });
      toast.success('Friend request sent successfully!');
    } catch (error) {
      console.error('Error sending friend request:', error);
      setAddFriendStatus({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'An error occurred while sending friend request'
      });
      toast.error(error instanceof Error ? error.message : 'Failed to send friend request');
    }
  };

  const handleFriendRequest = async (username: string, accept: boolean) => {
    try {
      const response = await fetch(`${config.serverRootURL}/friendRequests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ 
          friendUsername: username,
          acceptRequest: accept 
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${accept ? 'accept' : 'reject'} friend request`);
      }
      
      // Refresh friend requests and friends list
      fetchFriendRequests();
      if (accept) {
        fetchFriends();
        toast.success(`You are now friends with ${username}!`);
      } else {
        toast.info(`Friend request from ${username} rejected`);
      }
    } catch (error) {
      console.error(`Error ${accept ? 'accepting' : 'rejecting'} friend request:`, error);
      toast.error(error instanceof Error ? error.message : `Failed to ${accept ? 'accept' : 'reject'} friend request`);
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
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to remove friend');
        }
        
        // Update local state
        setFriends(friends.filter(friend => friend.username !== username));
        toast.success(`${username} has been removed from your friends`);
      } catch (error) {
        console.error('Error removing friend:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to remove friend');
      }
    }
  };

  const cancelFriendRequest = async (requestId: number, username: string) => {
    if (window.confirm(`Are you sure you want to cancel your friend request to ${username}?`)) {
      try {
        const response = await fetch(`${config.serverRootURL}/cancelFriendRequest`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ requestId }),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to cancel friend request');
        }
        
        // Update local state
        setOutgoingRequests(outgoingRequests.filter(request => request.friend_request_id !== requestId));
        toast.success(`Friend request to ${username} canceled`);
      } catch (error) {
        console.error('Error canceling friend request:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to cancel friend request');
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
        <form onSubmit={sendFriendRequest} className="flex gap-2">
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
            Send Request
          </button>
        </form>
        
        {addFriendStatus && (
          <div className={`mt-2 text-sm ${addFriendStatus.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            {addFriendStatus.message}
          </div>
        )}
      </div>
      
      {/* Tabs for Friends and Requests */}
      <div className="mb-4">
        <div className="flex border-b">
          <button
            className={`py-2 px-4 font-medium ${activeTab === 'friends' 
              ? 'border-b-2 border-blue-500 text-blue-600' 
              : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('friends')}
          >
            Friends ({friends.length})
          </button>
          <button
            className={`py-2 px-4 font-medium ${activeTab === 'requests' 
              ? 'border-b-2 border-blue-500 text-blue-600' 
              : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('requests')}
          >
            Requests {(incomingRequests.length > 0 || outgoingRequests.length > 0) && 
              `(${incomingRequests.length + outgoingRequests.length})`}
          </button>
        </div>
      </div>
      
      {/* Friends List */}
      {activeTab === 'friends' && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Your Friends</h2>
          {friends.length === 0 ? (
            <p className="text-gray-500">You don't have any friends yet. Add some using the form above!</p>
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
      )}
      
      {/* Friend Requests */}
      {activeTab === 'requests' && (
        <div>
          {/* Incoming Requests */}
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-4">Incoming Friend Requests</h2>
            {incomingRequests.length === 0 ? (
              <p className="text-gray-500">You don't have any pending friend requests.</p>
            ) : (
              <ul className="space-y-2">
                {incomingRequests.map((request) => (
                  <li 
                    key={request.friend_request_id}
                    className="flex items-center justify-between bg-white p-3 rounded shadow"
                  >
                    <div className="flex items-center gap-3">
                      {/* Profile picture or initial fallback */}
                      {request.profile_pic_link ? (
                        <img 
                          src={request.profile_pic_link}
                          alt={`${request.sender_username}'s profile`}
                          className="w-10 h-10 rounded-full object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-medium">
                          {getInitial(request.sender_username)}
                        </div>
                      )}
                      
                      <div>
                        <span className="font-medium">{request.sender_username}</span>
                        <span className="text-xs text-gray-500 block">
                          Sent {new Date(request.sent_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleFriendRequest(request.sender_username, true)}
                        className="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600"
                      >
                        Accept
                      </button>
                      <button 
                        onClick={() => handleFriendRequest(request.sender_username, false)}
                        className="px-3 py-1 bg-gray-300 text-gray-700 text-sm rounded hover:bg-gray-400"
                      >
                        Reject
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          
          {/* Outgoing Requests */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Sent Friend Requests</h2>
            {outgoingRequests.length === 0 ? (
              <p className="text-gray-500">You haven't sent any friend requests that are pending.</p>
            ) : (
              <ul className="space-y-2">
                {outgoingRequests.map((request) => (
                  <li 
                    key={request.friend_request_id}
                    className="flex items-center justify-between bg-white p-3 rounded shadow"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-white font-medium">
                        {getInitial(request.recipient_username)}
                      </div>
                      
                      <div>
                        <span className="font-medium">{request.recipient_username}</span>
                        <span className="text-xs text-gray-500 block">
                          Sent {new Date(request.sent_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => cancelFriendRequest(request.friend_request_id, request.recipient_username)}
                      className="text-sm text-red-500 hover:text-red-700 font-medium"
                    >
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FriendsList;