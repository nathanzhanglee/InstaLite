import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import ChatBot from "./pages/ChatBot";
import ChatInterface from "./pages/ChatInterface";
import ReactSession from './ReactSession';

// Pages
import Login from './pages/Login';
import Signup from './pages/Signup';
import HomePage from './pages/HomePage';

// Components
import NavigationBar from './components/NavigationBar/NavigationBar';

// protected route to check authentication
const ProtectedRoute = ({ children }) => {
  const user = ReactSession.getUser();
  const { username } = useParams();
  
  // redirect if not authenticated
  if (!user) {
    return <Navigate to="/" replace />;
  }
  
  // redirect to current username if URL username doesn't match session
  if (username && username !== user.username) {
    return <Navigate to={`/${user.username}/home`} replace />;
  }
  
  return (
    <>
      <NavigationBar />
      {children}
    </>
  );
};

function App() {
  const [isLoaded, setIsLoaded] = useState(false);
  
  useEffect(() => {
    setIsLoaded(true);
  }, []);
  
  if (!isLoaded) {
    return <div>Loading...</div>;
  }
  
  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <main className="p-4">
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path=":username/chat" element={<ProtectedRoute> <ChatInterface /> </ProtectedRoute>} />
          <Route path=":username/home" element={<ProtectedRoute> <HomePage /> </ProtectedRoute>} />
          <Route path="/search" element={<ProtectedRoute> <ChatBot /> </ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
