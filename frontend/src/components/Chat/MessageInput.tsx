import React, { useState } from 'react';

type Props = {
  onSend: (message: string) => void;
};

const MessageInput: React.FC<Props> = ({ onSend }) => {
  const [message, setMessage] = useState('');

  const send = () => {
    if (!message.trim()) return;
    onSend(message);
    setMessage('');
  };

  return (
    <div className="flex gap-2 p-4">
      <input
        type="text"
        className="flex-grow border p-2 rounded"
        placeholder="Type a message..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && send()}
      />
      <button onClick={send} className="bg-blue-500 text-white px-4 py-2 rounded">
        Send
      </button>
    </div>
  );
};

export default MessageInput;
