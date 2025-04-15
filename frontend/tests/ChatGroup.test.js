import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ChatGroup from '../src/components/Chat/ChatGroup';
import '@testing-library/jest-dom';

// socket mocks
const mockOn = jest.fn();
const mockEmit = jest.fn();
const mockDisconnect = jest.fn();

const mockSocket = {
  on: mockOn,
  emit: mockEmit,
  disconnect: mockDisconnect,
};

const mockIo = jest.fn(() => mockSocket);

jest.mock('socket.io-client', () => ({
  io: () => mockSocket
}));

describe('ChatGroup WebSocket Tests', () => {
  let receiveMessageCallback;
  let userJoinedCallback;
  let userLeftCallback;
  let userListCallback;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    mockOn.mockImplementation((event, callback) => {
      if (event === 'receive-message') {
        receiveMessageCallback = callback;
      } else if (event === 'user-joined') {
        userJoinedCallback = callback;
      } else if (event === 'user-left') {
        userLeftCallback = callback;
      } else if (event === 'user-list') {
        userListCallback = callback;
      }
      return mockSocket;
    });
  });

  test('socket connects on mount', () => {
    render(<ChatGroup />);
    expect(mockOn).toHaveBeenCalled();
  });

  test('emits join and username on connect', () => {
    render(<ChatGroup />);
    // regex to match usernames for now
    // TODO: change this to match username format we have in the future
    expect(mockEmit).toHaveBeenCalledWith('join', expect.stringMatching(/^user\d+$/));
  });

  test('registers socket event listeners on mount', () => {
    render(<ChatGroup />);
    expect(mockOn).toHaveBeenCalledWith('receive-message', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('user-joined', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('user-left', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('user-list', expect.any(Function));
  });

  test('sends message correctly via socket', () => {
    render(<ChatGroup />);
    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: /send/i });
    
    fireEvent.change(input, { target: { value: 'Hello, world!' } });
    fireEvent.click(sendButton);
    
    expect(mockEmit).toHaveBeenCalledWith('send-message', 'Hello, world!');
  });

  test('displays received messages', () => {
    render(<ChatGroup />);
    
    act(() => {
      receiveMessageCallback({
        sender: 'user123',
        content: 'Hello from user123',
        timestamp: new Date().toISOString()
      });
    });
    
    expect(screen.getByText('Hello from user123')).toBeInTheDocument();
  });

  test('displays system message when user joins', () => {
    render(<ChatGroup />);
    
    act(() => {
      userJoinedCallback('user456');
    });
    
    expect(screen.getByText('user456 joined the chat')).toBeInTheDocument();
  });

  test('displays system message when user leaves', () => {
    render(<ChatGroup />);
    
    act(() => {
      userLeftCallback('user123');
    });
    
    expect(screen.getByText('user123 left the chat')).toBeInTheDocument();
  });

  test('updates online users count when user list updates', () => {
    render(<ChatGroup />);
    
    act(() => {
      userListCallback(['user1', 'user2', 'user3']);
    });
    
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('disconnects socket on component unmount', () => {
    const { unmount } = render(<ChatGroup />);
    unmount();
    expect(mockDisconnect).toHaveBeenCalled();
  });
});