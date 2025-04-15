import { useState } from 'react'
import axios from 'axios';
import { useParams } from 'react-router-dom';

const MessageComponent = ({ sender, message }) => {
    return (
        <div className={`w-full flex ${sender === 'user' && 'justify-end'}`}>
            <div className={`text-left max-w-[70%] p-3 rounded-md break-words ${sender === 'user' ? 'bg-blue-100' : 'bg-slate-200'}`}>
                {message}
            </div>
        </div>
    )
}

export default function ChatBot() {
    const [messages, setMessages] = useState([{ sender: 'chatbot', message: 'Hi there! Ask me anything.' }]);
    const [input, setInput] = useState<string>('');
    const { username } = useParams();

    const sendMessage = async () => {
        // CUT HERE 
        try {
            setMessages(prev => [...prev, { sender: 'user', message: input }]);

            var response = await axios.post('http://localhost:8080/search', {
                username: username,
                question: input
              })
            setMessages(prev => [...prev, { sender: 'chatbot', message: response.data.message }])
        } catch (error) {
            setMessages(prev => [...prev, { sender: 'chatbot', message: 'Sorry, there was an issue. Please try again.' }])
        }
        // END CUT
    }

    return (
        <div className='w-screen h-screen flex flex-col items-center'>
        <div className='w-full h-16 bg-slate-50 flex justify-center mb-2'>
            <div className='text-2xl max-w-[1800px] w-full flex items-center'>
            InstaLite&nbsp;
            </div>
        </div>
            <div className='font-bold text-3xl'>Natural Language Search</div>
            <div className='h-[40rem] w-[30rem] bg-slate-100 p-3'>
                <div className='h-[90%] overflow-scroll'>
                    <div className='space-y-2'>
                        {messages.map(msg => {
                            return (
                                <MessageComponent sender={msg.sender} message={msg.message} />
                            )
                        })}
                    </div>
                </div>
                <div className='w-full flex space-x-2'>
                    <input className='w-full outline-none border-none px-3 py-1 rounded-md'
                        placeholder='Ask something!'
                        onChange={e => setInput(e.target.value)}
                        value={input}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                sendMessage();
                                setInput('');
                            }
                        }} />
                    <button className='outline-none px-3 py-1 rounded-md text-bold bg-indigo-600 text-white'
                        onClick={() => {
                            sendMessage();
                        }}>Send</button>
                </div>
            </div>
        </div>
    )
}
