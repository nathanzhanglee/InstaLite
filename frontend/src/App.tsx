import { Routes, Route, Navigate } from 'react-router-dom';
import ChatBot from "./pages/ChatBot";
import ChatInterface from "./pages/ChatInterface";

function App() {
  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <main className="p-4">
        <Routes>
        
          <Route path="/chat" element={<ChatInterface />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
