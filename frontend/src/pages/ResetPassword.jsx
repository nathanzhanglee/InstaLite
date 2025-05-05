import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import config from '../../config.json';
import './ResetPassword.css';

export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isError, setIsError] = useState(false);

  const rootURL = config.serverRootURL;

  // Extract token from URL query parameters on component mount
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tokenParam = params.get('token');
    
    if (!tokenParam) {
      setIsError(true);
      setMessage('Invalid reset link. Please request a new password reset link.');
    } else {
      setToken(tokenParam);
    }
  }, [location]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate password inputs
    if (!newPassword.trim()) {
      setMessage('Please enter a new password');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setMessage('Passwords do not match');
      return;
    }
    
    // Password strength validation
    if (newPassword.length < 8) {
      setMessage('Password must be at least 8 characters long');
      return;
    }
    
    try {
      setIsLoading(true);
      const response = await axios.post(`${rootURL}/resetPassword`, {
        token,
        newPassword
      });
      
      setIsSuccess(true);
      setMessage('Your password has been reset successfully!');
    } catch (error) {
      console.error('Error resetting password:', error);
      setIsError(true);
      setMessage(error.response?.data?.error || 'An error occurred. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const returnToLogin = () => {
    navigate('/login');
  };

  // Display error message if token is missing or invalid
  if (isError) {
    return (
      <div className='reset-password-container'>
        <h1 className="welcome-title">Pennstagram Password Reset</h1>
        <div className='reset-password-form'>
          <div className='reset-password-title'>Error</div>
          <div className='reset-password-error-message'>{message}</div>
          <button
            type="button"
            className="reset-password-button"
            onClick={returnToLogin}
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  // Display success message after successful password reset
  if (isSuccess) {
    return (
      <div className='reset-password-container'>
        <h1 className="welcome-title">Pennstagram Password Reset</h1>
        <div className='reset-password-form'>
          <div className='reset-password-title'>Success!</div>
          <div className='reset-password-success-message'>{message}</div>
          <button
            type="button"
            className="reset-password-button"
            onClick={returnToLogin}
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className='reset-password-container'>
      <h1 className="welcome-title">Pennstagram Password Reset</h1>
      <form onSubmit={handleSubmit}>
        <div className='reset-password-form'>
          <div className='reset-password-title'>Reset Your Password</div>
          
          <p className="reset-password-instruction">
            Enter a new password for your account.
          </p>
          
          <div className='reset-password-input-row'>
            <label htmlFor="newPassword">New Password</label>
            <input
              id="newPassword"
              type="password"
              className='reset-password-input'
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={isLoading}
              required
              minLength={8}
            />
          </div>
          
          <div className='reset-password-input-row'>
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              className='reset-password-input'
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>
          
          {message && <div className='reset-password-message'>{message}</div>}
          
          <div className="reset-password-button-stack">
            <button
              type="submit"
              className="reset-password-button"
              disabled={isLoading || !token}
            >
              {isLoading ? 'Resetting...' : 'Set New Password'}
            </button>
            <button
              type="button"
              className="reset-password-button secondary"
              onClick={returnToLogin}
              disabled={isLoading}
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}