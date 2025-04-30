import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';

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
  content: string;
  sent_at: string;
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
  
  // Initialize Socket.IO connection
  useEffect(() => {
    const newSocket = io('http://localhost:8080', {
      transports: ['websocket'],
      upgrade: false,
    });
    
    setSocket(newSocket);
    
    return () => {
      newSocket.disconnect();
    };
  }, []);
  
  // Listen for real-time messages when active chat changes
  useEffect(() => {
    if (!socket || !activeChatId) return;
    
    // Leave previous chat room if any
    socket.emit('leaveRoom', `chat-${activeChatId}`);
    
    // Join the new chat room
    socket.emit('joinRoom', `chat-${activeChatId}`);
    
    // Listen for new messages
    const handleNewMessage = (msg: Message) => {
      setMessages((prev) => [...prev, msg]);
    };
    
    socket.on('receiveMessage', handleNewMessage);
    
    return () => {
      socket.off('receiveMessage', handleNewMessage);
      socket.emit('leaveRoom', `chat-${activeChatId}`);
    };
  }, [socket, activeChatId]);
  
  // Fetch chat rooms
  const fetchChatRooms = async () => {
    setLoadingChats(true);
    try {
      const response = await axios.get('/chatRooms');
      setChatRooms(response.data);
    } catch (error) {
      console.error('Error fetching chat rooms:', error);
    } finally {
      setLoadingChats(false);
    }
  };
  
  // Fetch chat invitations
  const fetchChatInvites = async () => {
    setLoadingInvites(true);
    try {
      const response = await axios.get('/chatInvites');
      setInvites(response.data);
    } catch (error) {
      console.error('Error fetching chat invites:', error);
    } finally {
      setLoadingInvites(false);
    }
  };
  
  // Create a new chat room
  const createChatRoom = async (name: string, initialMembers: string[] = []) => {
    try {
      const response = await axios.post('/createChatRoom', { roomName: name, initialMembers });
      
      // Refresh the chat rooms list
      fetchChatRooms();
      
      return response.data.chatId; // Make sure it returns the chatId
    } catch (error) {
      console.error('Error creating chat room:', error);
      throw error;
    }
  };
  
  // Send a chat invitation
  const sendChatInvite = async (chatId: number, username: string) => {
    try {
      await axios.post('/sendChatInvite', { 
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
      const response = await axios.post('/respondToChatInvite', { inviteId, accept });
      
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
  const handleSetActiveChatId = async (chatId: number | null) => {
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
      
      // Load chat members
      const membersResponse = await axios.get(`/chatMembers/${chatId}`);
      setActiveChatMembers(membersResponse.data);
      
      // Load messages
      const messagesResponse = await axios.get(`/messages/${chatId}`);
      setMessages(messagesResponse.data.reverse()); // Reverse to show newest at bottom
    } catch (error) {
      console.error('Error loading chat data:', error);
    } finally {
      setLoadingMessages(false);
    }
  };
  
  // Send a message
  const sendMessage = async (content: string) => {
    if (!activeChatId || !content.trim()) return;
    
    try {
      const response = await axios.post('/api/sendMessage', {
        chatId: activeChatId,
        content
      });
      
      // Real-time updates will come through socket
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  };
  
  // Leave a chat room
  const leaveChat = async (chatId: number) => {
    try {
      await axios.post('/api/leaveChatRoom', { chatId });
      
      // If this was the active chat, clear it
      if (activeChatId === chatId) {
        setActiveChatId(null);
        setActiveChatName(null);
        setActiveChatMembers([]);
        setMessages([]);
      }
      
      // Refresh chat rooms list
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