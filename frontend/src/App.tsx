import { Routes, Route, Navigate } from 'react-router-dom';
import ChatBot from "./pages/ChatBot";
import ChatInterface from "./pages/ChatInterface";

// Pages
import Login from './pages/Login';
import Signup from './pages/Signup';

// Components
import NavigationBar from './components/NavigationBar';

function App() {
  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <main className="p-4">
        <Routes>
          <Route path="/" element ={<Login />} />
          <Route path="/signup" element ={<Signup />} />
          <Route path="/chat" element={<ChatInterface />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
