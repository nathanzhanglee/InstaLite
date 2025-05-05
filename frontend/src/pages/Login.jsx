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
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const rootURL = config.serverRootURL;

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setErrorMessage('Please enter both username and password');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

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
      setErrorMessage(error.response?.data?.error || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const signup = () => {
    navigate("/signup");
  };

  const forgotPassword = () => {
    navigate("/forgot-password");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleLogin();
  };

  return (
    <div className='login-container'>
      <h1 className="welcome-title">Welcome to Pennstagram!</h1>
      <form onSubmit={handleSubmit}>
        <div className='login-form'>
          <div className='login-title'>Log In</div>
          
          <div className='login-input-row'>
            <label htmlFor="username" className='font-semibold'>Username:</label>
            <input 
              id="username" 
              type="text" 
              className='login-input'
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              disabled={isLoading}
            />
          </div>
          
          <div className='login-input-row'>
            <label htmlFor="password" className='font-semibold'>Password:</label>
            <input 
              id="password" 
              type="password" 
              className='login-input'
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              disabled={isLoading}
            />
          </div>
          
          {errorMessage && (
            <div className="text-red-500 text-sm mt-2">
              {errorMessage}
            </div>
          )}
          
          <div className="login-button-stack">
            <button 
              type="submit" 
              className="login-button" 
              disabled={isLoading}
            >
              {isLoading ? 'Logging in...' : 'Log in'}
            </button>
            
            <button 
              type="button" 
              className="login-button" 
              onClick={signup}
              disabled={isLoading}
            >
              Sign up
            </button>
            
            <button 
              type="button" 
              className="text-blue-600 hover:text-blue-800 text-sm mt-4" 
              onClick={forgotPassword}
              disabled={isLoading}
            >
              Forgot your password?
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}