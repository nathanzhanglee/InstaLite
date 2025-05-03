import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import config from '../../../config.json';
import ReactSession from '../../ReactSession';

type ChatRoom = {
  chat_id: number;
  name: string;
  created_at: string;
  member_count: number;
};

type ChatInvite = {
  invite_id: number;
  chat_id: number;
  chat_name: string;
  sender_username: string;
  sent_at: string;
};

type ChatMember = {
  user_id: number;
  username: string;
  profile_pic_link: string | null;
  is_online: number;
  joined_at: string;
};

type Message = {
  message_id: number | string;
  sender_id: number;
  sender_username: string;
  sender_profile_pic?: string;
  chatId: number;
  content: string;
  sent_at: string;
  tempId?: string;
};

type ChatContextType = {
  chatRooms: ChatRoom[];
  invites: ChatInvite[];
  activeChatId: number | null;
  activeChatName: string | null;
  activeChatMembers: ChatMember[];
  messages: Message[];
  loadingChats: boolean;
  loadingInvites: boolean;
  loadingMessages: boolean;
  fetchChatRooms: () => void;
  fetchChatInvites: () => void;
  createChatRoom: (name: string, initialMembers: string[]) => Promise<void>;
  sendChatInvite: (chatId: number, username: string) => Promise<void>;
  respondToInvite: (inviteId: number, accept: boolean) => Promise<void>;
  setActiveChatId: (chatId: number | null) => void;
  sendMessage: (content: string) => Promise<void>;
  leaveChat: (chatId: number) => Promise<void>;
};

const ChatContext = createContext<ChatContextType | null>(null);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [invites, setInvites] = useState<ChatInvite[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [activeChatName, setActiveChatName] = useState<string | null>(null);
  const [activeChatMembers, setActiveChatMembers] = useState<ChatMember[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingChats, setLoadingChats] = useState<boolean>(false);
  const [loadingInvites, setLoadingInvites] = useState<boolean>(false);
  const [loadingMessages, setLoadingMessages] = useState<boolean>(false);

  // Set axios default config for all requests
  axios.defaults.withCredentials = true;

  const rootURL = config.serverRootURL;

  // Initialize Socket.IO connection
  useEffect(() => {
    const userId = localStorage.getItem('userId');
    if (!userId) {
      const user = ReactSession.getUser();
      console.log("User from ReactSession:", user);
      if (user && user.userId) {
        localStorage.setItem('userId', user.userId.toString());
      } else {
        console.error("No user ID available for socket connection");
        return;
      }
    }
    const newSocket = io('http://localhost:8080', {
      transports: ['websocket'],
      upgrade: false,
      withCredentials: true,
      auth: {
        userId: userId // Pass user ID in auth object
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Handle socket disconnects/reconnects
  useEffect(() => {
    if (!socket) return;

    const handleDisconnect = () => {
      console.log('Socket disconnected');
      // You might want to show a UI notification that connection was lost
    };

    const handleReconnect = () => {
      console.log('Socket reconnected');

      // Re-join active chat room if any
      if (activeChatId) {
        socket.emit('joinRoom', `chat-${activeChatId}`);
      }

      // You might want to refresh data that could have been missed
    };

    socket.on('disconnect', handleDisconnect);
    socket.on('connect', handleReconnect);

    return () => {
      socket.off('disconnect', handleDisconnect);
      socket.off('connect', handleReconnect);
    };
  }, [socket, activeChatId]);

  // Ensure unique members by user_id
  const loadChatMembers = async (chatId: number) => {
    try {
      const membersResponse = await axios.get(`${rootURL}/chatMembers/${chatId}`);
      
      const uniqueMembers: { [key: number]: ChatMember } = {};
      membersResponse.data.forEach((member: ChatMember) => {
        uniqueMembers[member.user_id] = member;
      });
      
      setActiveChatMembers(Object.values(uniqueMembers));
    } catch (error) {
      console.error('Error fetching chat members:', error);
    }
  };

  // Listen for real-time messages when active chat changes
  useEffect(() => {
    if (!socket || !activeChatId) return;

    const roomName = `chat-${activeChatId}`;

    socket.emit('joinRoom', roomName);

    socket.on('joinedRoom', async (room) => {
      console.log(`Successfully joined room: ${room}`);

      // After joining a room, fetch the complete member list from server
      // instead of relying on incremental updates
      await loadChatMembers(activeChatId);
    });

    // Listen for new messages
    const handleNewMessage = (msg: Message) => {
      console.log('Received message:', msg);
      console.log('Current active chat ID:', activeChatId);
      console.log('Message chat ID:', msg.chatId);
      setMessages((prev) => {
        // Filter out temporary message if it exists
        if (msg.tempId) {
          return [...prev.filter(m => m.message_id !== msg.tempId), msg];
        }
        return [...prev, msg];
      });
    };

    // Handle when a user joins the chat
    const handleUserJoin = (data: { userId: number, username: string }) => {
      // Convert userId to number for consistent comparison
      const joinedUserId = typeof data.userId === 'string' ? 
        parseInt(data.userId, 10) : data.userId;
          
      // Get our own userId for comparison
      const myUserId = parseInt(localStorage.getItem('userId') || '0', 10);
          
      // Only handle join events for other users, not ourselves
      if (myUserId === joinedUserId) {
        return;
      }

      // Add a system message about the user joining
      const systemMessage: Message = {
        message_id: `system-join-${Date.now()}`,
        sender_id: -1, // Use -1 to indicate system message
        sender_username: 'System',
        content: `${data.username} joined the chat`,
        chatId: activeChatId || 0,
        sent_at: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, systemMessage]);

      // Update members list avoiding duplicates
      setActiveChatMembers(prev => {
        // Check if user already exists with strict number comparison
        const exists = prev.some(member => 
          parseInt(String(member.user_id), 10) === joinedUserId
        );
            
        if (exists) {
          return prev; // No changes if user exists
        }
            
        // Add the new user to the list
        return [...prev, {
          user_id: joinedUserId,
          username: data.username,
          profile_pic_link: null,
          is_online: 1,
          joined_at: new Date().toISOString()
        }];
      });
    };

    // Handle when a user leaves the chat
    const handleUserLeave = (data: { userId: number | string, username: string }) => {
      console.log('User leaving chat:', data);
      
      // No need to search for the user since we get the username directly
      const username = data.username;
      
      // Add system message for user leaving
      const systemMessage: Message = {
        message_id: `system-leave-${Date.now()}`,
        sender_id: -1, // Use -1 to indicate system message
        sender_username: 'System',
        content: `${username} left the chat`,
        chatId: activeChatId || 0,
        sent_at: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, systemMessage]);
      
      // Convert userId to number for consistent comparison
      const leavingUserId = typeof data.userId === 'string' ? 
        parseInt(data.userId, 10) : data.userId;
      
      // Remove from member list
      setActiveChatMembers(prev =>
        prev.filter(member => 
          parseInt(String(member.user_id), 10) !== leavingUserId
        )
      );
    };

    socket.on('receiveMessage', handleNewMessage);
    socket.on('userJoinedChat', handleUserJoin);
    socket.on('userLeftChat', handleUserLeave);

    return () => {
      console.log(`Leaving room: ${roomName}`);
      socket.emit('leaveRoom', roomName);
      
      // Clean up all event listeners
      socket.off('joinedRoom');
      socket.off('receiveMessage', handleNewMessage);
      socket.off('userJoinedChat', handleUserJoin);
      socket.off('userLeftChat', handleUserLeave);
    };
  }, [socket, activeChatId, rootURL]);

  // Fetch chat rooms
  const fetchChatRooms = useCallback(async () => {
    setLoadingChats(true);
    try {
      const response = await axios.get(`${rootURL}/chatRooms`, {
        timeout: 1000 // 5 seconds timeout
      });
      setChatRooms(response.data || []); // Ensure we set an empty array if data is null
    } catch (error) {
      console.error('Error fetching chat rooms:', error);
      setChatRooms([]); // Set empty array on error
    } finally {
      setLoadingChats(false);
    }
  }, [rootURL]);

  // Fetch chat invitations
  const fetchChatInvites = useCallback(async () => {
    setLoadingInvites(true);
    try {
      const response = await axios.get(`${rootURL}/chatInvites`, {
        timeout: 1000
      });
      setInvites(response.data || []);
    } catch (error) {
      console.error('Error fetching chat invites:', error);
      setInvites([]);
    } finally {
      setLoadingInvites(false);
    }
  }, [rootURL]);

  // Create a new chat room
  const createChatRoom = async (name: string, initialMembers: string[] = []) => {
    try {
      const response = await axios.post(`${rootURL}/createChatRoom`, { roomName: name, initialMembers });
      
      // Refresh the chat rooms list
      fetchChatRooms();
      
      // Return the chat ID from the response
      return response.data.chatId;
    } catch (error) {
      console.error('Error creating chat room:', error);
      throw error;
    }
  };

  // Send a chat invitation
  const sendChatInvite = async (chatId: number, username: string) => {
    try {
      await axios.post(`${rootURL}/sendChatInvite`, {
        chatId,
        recipientUsername: username
      });
    } catch (error) {
      console.error('Error sending chat invite:', error);
      throw error;
    }
  };

  // Respond to a chat invitation
  const respondToInvite = async (inviteId: number, accept: boolean) => {
    try {
      const response = await axios.post(`${rootURL}/respondToChatInvite`, { inviteId, accept });

      // Refresh lists
      fetchChatInvites();
      if (accept) {
        fetchChatRooms();
      }

      return response.data;
    } catch (error) {
      console.error('Error responding to invite:', error);
      throw error;
    }
  };

  // Set the active chat and load its data
  const handleSetActiveChatId = useCallback(async (chatId: number | null) => {
    setActiveChatId(chatId);

    if (!chatId) {
      setActiveChatName(null);
      setActiveChatMembers([]);
      setMessages([]);
      return;
    }

    setLoadingMessages(true);

    try {
      // Find chat name
      const room = chatRooms.find(room => room.chat_id === chatId);
      setActiveChatName(room?.name || null);

      // Load chat members using the dedicated function
      await loadChatMembers(chatId);

      // Load messages
      const messagesResponse = await axios.get(`${rootURL}/messages/${chatId}`);
      setMessages(messagesResponse.data.reverse()); // Reverse to show newest at bottom
    } catch (error) {
      console.error('Error loading chat data:', error);
    } finally {
      setLoadingMessages(false);
    }
  }, [chatRooms, rootURL]);

  // Send a message
  const sendMessage = async (content: string) => {
    if (!activeChatId || !content.trim() || !socket) return;

    try {
      // Generate a temporary ID for optimistic UI updates
      const tempId = `temp-${Date.now()}`;

      // Add message to UI immediately (optimistic update)
      const tempMessage: Message = {
        message_id: tempId,
        sender_id: parseInt(localStorage.getItem('userId') || '0'),
        sender_username: localStorage.getItem('username') || 'Me',
        content,
        chatId: activeChatId,
        sent_at: new Date().toISOString()
      };

      setMessages(prev => [...prev, tempMessage]);

      // Emit message via socket instead of HTTP request
      socket.emit('sendMessage', {
        chatId: activeChatId,
        content,
        tempId
      });
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  };

  // Leave a chat room
  const leaveChat = async (chatId: number) => {
    try {
      await axios.post(`${rootURL}/leaveChatRoom`, { chatId });

      // If this was the active chat, clear it
      if (activeChatId === chatId) {
        setActiveChatId(null);
        setActiveChatName(null);
        setActiveChatMembers([]);
        setMessages([]);
      }

      // Immediately remove this room from local state
      setChatRooms(prev => prev.filter(room => room.chat_id !== chatId));
      
      // Then refresh the full list from the server
      fetchChatRooms();
    } catch (error) {
      console.error('Error leaving chat:', error);
      throw error;
    }
  };

  // Initial data loading
  useEffect(() => {
    fetchChatRooms();
    fetchChatInvites();
  }, []);

  return (
    <ChatContext.Provider value={{
      chatRooms,
      invites,
      activeChatId,
      activeChatName,
      activeChatMembers,
      messages,
      loadingChats,
      loadingInvites,
      loadingMessages,
      fetchChatRooms,
      fetchChatInvites,
      createChatRoom,
      sendChatInvite,
      respondToInvite,
      setActiveChatId: handleSetActiveChatId,
      sendMessage,
      leaveChat
    }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (context === null) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};