import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './NavigationBar.css';
import ReactSession from '../../ReactSession';
import ActivityTracker from '../../utils/ActivityTracker';
import axios from 'axios';
import config from '../../../config.json';

const NavigationBar = () => {
    const [username, setUsername] = useState('');
    const navigate = useNavigate();
    const rootURL = config.serverRootURL;
    
    useEffect(() => {
        // get user data on mount
        const user = ReactSession.getUser();
        if (user && user.username) {
            setUsername(user.username);
        }
    }, []);

    const handleLogout = async () => {
        try {
            ActivityTracker.stopTracking();
            
            await axios.post(`${rootURL}/logout`, {}, { withCredentials: true });
        
            ReactSession.clearUser();
            navigate('/');
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

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
                <li>
                    <button onClick={handleLogout} className="logout-button">Logout</button>
                </li>
            </ul>
        </nav>
    );
};

export default NavigationBar;