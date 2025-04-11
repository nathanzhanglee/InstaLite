import React from 'react';

type Message = {
  sender: string;
  content: string;
  timestamp?: string;
};

type Props = {
  messages: Message[];
};

const MessageList: React.FC<Props> = ({ messages }) => {
  return (
    <div className="flex flex-col gap-2 overflow-y-auto h-[80%] p-4">
      {messages.map((msg, i) => (
        <div
          key={i}
          className={`max-w-[80%] p-3 rounded-md ${
            msg.sender === 'me' 
              ? 'bg-blue-100 self-end rounded-br-none' 
              : msg.sender === 'system'
                ? 'bg-yellow-50 self-center italic text-sm text-gray-500'
                : msg.sender.startsWith('user')
                  ? 'bg-green-100 self-start rounded-bl-none'
                  : 'bg-gray-100 self-start rounded-bl-none'
          }`}
        >
          {msg.sender !== 'system' && (
            <div className="font-semibold text-sm">
              {msg.sender === 'me' ? 'You' : msg.sender}
              <span className="ml-2 text-xs text-gray-500">
                {msg.timestamp && new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
          )}
          <div className={`${msg.sender === 'system' ? 'text-center' : 'mt-1'}`}>
            {msg.content}
          </div>
        </div>
      ))}
    </div>
  );
};

export default MessageList;