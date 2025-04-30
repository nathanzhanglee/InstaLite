import React, { useEffect } from 'react';
import { useChat } from './ChatContext';

interface ChatRoomsListProps {
  onSelectRoom: (chatId: number) => void;
}

const ChatRoomsList: React.FC<ChatRoomsListProps> = ({ onSelectRoom }) => {
  const { chatRooms, loadingChats, fetchChatRooms } = useChat();

  useEffect(() => {
    fetchChatRooms();
  }, [fetchChatRooms]);

  if (loadingChats) {
    return <div className="loading-spinner">Loading your chat rooms...</div>;
  }

  // Make sure chatRooms is an array
  const roomsArray = Array.isArray(chatRooms) ? chatRooms : [];

  if (roomsArray.length === 0) {
    return (
      <div className="empty-state">
        <h2>No Chat Rooms</h2>
        <p>You haven't joined any chat rooms yet.</p>
        <p>Create a new chat room or wait for an invitation.</p>
      </div>
    );
  }

  return (
    <div className="chat-rooms-list">
      <h2>My Chat Rooms</h2>
      <ul className="room-list">
        {roomsArray.map((room) => (
          <li key={room.chat_id} className="room-item" onClick={() => onSelectRoom(room.chat_id)}>
            <div className="room-name">{room.name}</div>
            <div className="room-meta">
              <span className="member-count">{room.member_count} members</span>
              <span className="created-date">
                Created {new Date(room.created_at).toLocaleDateString()}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ChatRoomsList;