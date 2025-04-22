import React, { useEffect } from 'react';
import axios from 'axios';
import config from '../../config.json';

const Layout = ({ children }) => {
  const rootURL = config.serverRootURL;
  
  useEffect(() => {
    const intervalId = setInterval(() => {
      axios.post(`${rootURL}/updateActivity`, {}, { withCredentials: true })
        .catch(err => console.error('Error updating activity status:', err));
    }, 30000);
    
    return () => clearInterval(intervalId);
  }, []);
  
  return (
    <div className="min-h-screen">
      {children}
    </div>
  );
};

export default Layout;