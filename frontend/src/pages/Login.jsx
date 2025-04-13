import { useState } from 'react';
import axios from 'axios';
import config from '../../config.json';
import { useNavigate } from 'react-router-dom';
import './Login.css';

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
      console.log('Login successful:', response.data);
      navigate(`/${username}/home`);
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
          <div className='w-full flex justify-center'>
            <button type="button" className='login-button' onClick={handleLogin}>
              Log in
            </button>
          </div>
          <div className='w-full flex justify-center'>
            <button type="button" className='login-button' onClick={signup}>
              Sign up
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}