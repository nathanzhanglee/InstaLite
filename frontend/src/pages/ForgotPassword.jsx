import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import config from '../../config.json';
import './ForgotPassword.css';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const rootURL = config.serverRootURL;

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!email.trim()) {
      setMessage('Please enter your email address');
      return;
    }
    
    try {
      setIsLoading(true);
      const response = await axios.post(`${rootURL}/forgotPassword`, {
        email
      });
      
      setIsSuccess(true);
      setMessage('If an account with that email exists, a password reset link has been sent.');
    } catch (error) {
      console.error('Error requesting password reset:', error);
      setMessage(error.response?.data?.error || 'An error occurred. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const returnToLogin = () => {
    navigate('/');
  };

  return (
    <div className='forgot-password-container'>
      <h1 className="welcome-title">Pennstagram Password Reset</h1>
      <form onSubmit={handleSubmit}>
        <div className='forgot-password-form'>
          <div className='forgot-password-title'>Forgot Password</div>
          
          {!isSuccess ? (
            <>
              <p className="forgot-password-instruction">
                Enter your email address and we'll send you a link to reset your password.
              </p>
              
              <div className='forgot-password-input-row'>
                <label htmlFor="email">Email Address</label>
                <input
                  id="email"
                  type="email"
                  className='forgot-password-input'
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>
              
              {message && <div className='forgot-password-message'>{message}</div>}
              
              <div className="forgot-password-button-stack">
                <button
                  type="submit"
                  className="forgot-password-button"
                  disabled={isLoading}
                >
                  {isLoading ? 'Sending...' : 'Reset Password'}
                </button>
                <button
                  type="button"
                  className="forgot-password-button secondary"
                  onClick={returnToLogin}
                  disabled={isLoading}
                >
                  Back to Login
                </button>
              </div>
            </>
          ) : (
            <div className='forgot-password-success'>
              <p>{message}</p>
              <button
                type="button"
                className="forgot-password-button"
                onClick={returnToLogin}
              >
                Return to Login
              </button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}