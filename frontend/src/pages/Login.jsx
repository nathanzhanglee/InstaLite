import { useState } from 'react';
import axios from 'axios';
import config from '../../config.json';
import { useNavigate } from 'react-router-dom';
import './Login.css';
import ReactSession from '../ReactSession';
import ActivityTracker from '../utils/ActivityTracker';

export default function Login() {
  const navigate = useNavigate(); 
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const rootURL = config.serverRootURL;

  const handleLogin = async () => {
    try {
      const response = await axios.post(`${rootURL}/login`, {
        username,
        password
      }, { withCredentials: true });
      
      if (response.status === 200) {
        ActivityTracker.startTracking();
        
        // Store both username and userId
        const userId = response.data.userId;
        const user = {
          'username': username,
          'userId': userId
        };
        ReactSession.setUser(user);
        
        // Also store userId separately in localStorage for WebSockets
        localStorage.setItem('userId', userId.toString());
        
        navigate('/feed');
      }
    } catch (error) {
      console.error('Login failed:', error);
      alert('Login failed.');
    }
  };

  const signup = () => {
    navigate("/signup");
  };

  return (
    <div className='login-container'>
      <h1 className="welcome-title">Welcome to Pennstagram!</h1>
      <form>
        <div className='login-form'>
          <div className='login-title'>Log In</div>
          <div className='login-input-row'>
            <label htmlFor="username" className='font-semibold'>Username:</label>
            <input id="username" type="text" className='login-input'
              value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className='login-input-row'>
            <label htmlFor="password" className='font-semibold'>Password:</label>
            <input id="password" type="password" className='login-input'
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="login-button-stack">
            <button type="button" className="login-button" onClick={handleLogin}>
              Log in
            </button>
            <button type="button" className="login-button" onClick={signup}>
              Sign up
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}