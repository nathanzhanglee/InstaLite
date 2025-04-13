import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios'; 
import config from '../../config.json';
import './Signup.css';

export default function Signup() {
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [linked_nconst, setLinkedNconst] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const rootURL = config.serverRootURL;

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (password !== confirmPassword) {
            alert('Passwords do not match');
            return;
        }

        try {
            const response = await axios.post(`${rootURL}/register`, {
                username: username, 
                password: password,
                linked_id: linked_nconst
            });
            alert('Welcome ' + username + '!');
            navigate("/home/" + username);
        } catch (error) {
            console.error('Registration error:', error.response?.data?.error);
            alert('Registration failed: ' + (error.response?.data?.error || 'Unknown error'));
        }
    };

    return (
        <div className='signup-container'>
            <form onSubmit={handleSubmit}>
                <div className='signup-form'>
                    <div className='signup-title'>Sign Up to Pennstagram</div>
                    
                    <div className='signup-input-row'>
                        <label htmlFor="username">Username</label>
                        <input
                            id="username"
                            type="text"
                            className='signup-input'
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                        />
                    </div>
                    
                    <div className='signup-input-row'>
                        <label htmlFor="linked_nconst">Linked nconst</label>
                        <input
                            id="linked_nconst"
                            type="text"
                            className='signup-input'
                            value={linked_nconst}
                            onChange={(e) => setLinkedNconst(e.target.value)}
                            required
                        />
                    </div>
                    
                    <div className='signup-input-row'>
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            className='signup-input'
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    
                    <div className='signup-input-row'>
                        <label htmlFor="confirmPassword">Confirm Password</label>
                        <input
                            id="confirmPassword"
                            type="password"
                            className='signup-input'
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                        />
                    </div>
                    
                    <button type="submit" className='signup-button'>
                        Sign up
                    </button>
                </div>
            </form>
        </div>
    );
}