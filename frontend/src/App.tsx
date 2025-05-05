import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import ChatBot from "./pages/ChatBot";
import ChatInterface from "./pages/ChatInterface";
import ReactSession from './ReactSession';

// Pages
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import CreatePost from './pages/CreatePost';
import FriendsList from './pages/FriendsList';
import Profile from './pages/Profile';
import ProfileEdit from './pages/ProfileEdit';
import Feed from './pages/Feed';

// Components
import NavigationBar from './components/NavigationBar/NavigationBar';
import Layout from './components/Layout';

import ActivityTracker from './utils/ActivityTracker';

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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  useEffect(() => {
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      ActivityTracker.startTracking();
    } else {
      ActivityTracker.stopTracking();
    }
    return () => {
      ActivityTracker.stopTracking();
    };
  }, [isLoggedIn]);
  
  if (!isLoaded) {
    return <div>Loading...</div>;
  }
  
  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <ToastContainer position="top-right" autoClose={3000} />
      <main className="p-4">
        <Layout>
        {<Routes>
          <Route path="/" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route path=":username/chat" element={<ProtectedRoute> <ChatInterface /> </ProtectedRoute>} />
          <Route path="/feed" element={<ProtectedRoute> <Feed /> </ProtectedRoute>} />
          <Route path="/createPost" element={<ProtectedRoute> <CreatePost /> </ProtectedRoute>} />
          <Route path="/search" element={<ProtectedRoute> <ChatBot /> </ProtectedRoute>} />
          <Route path="/friends" element={<ProtectedRoute> <FriendsList /> </ProtectedRoute>} />
          <Route path="/profile/:username" element={<ProtectedRoute> <Profile /> </ProtectedRoute>} />
          <Route path="/profile/edit/:username" element={<ProfileEdit />} />
        </Routes>}
        </Layout>
      </main>
    </div>
  );
}

export default App;
