import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './NavigationBar.css';
import ReactSession from '../../ReactSession';

const NavigationBar = () => {
    const [username, setUsername] = useState('');
    
    useEffect(() => {
        // get user data on mount
        const user = ReactSession.getUser();
        if (user && user.username) {
            setUsername(user.username);
        }
    }, []);

    return (
        <nav className="navigation-bar">
            <div className="nav-logo">
                <Link to={`/${username}/home`}>Pennstagram</Link>
            </div>
            <ul className="nav-links">
                <li>
                    <Link to="/feed">Feed</Link>
                </li>
                <li>
                    <Link to="/search">Search</Link>
                </li>
                <li>
                    {username ? (
                        <Link to={`/${username}/chat`}>Chat</Link>
                    ) : (
                        <Link to="/login">Chat</Link>
                    )}
                </li>
                <li>
                    <Link to="/chatbot">Chatbot</Link>
                </li>
                <li>
                    <Link to="/friends">Friends</Link>
                </li>
                <li>
                    <Link to="/profile">Profile</Link>
                </li>
            </ul>
        </nav>
    );
};

export default NavigationBar;