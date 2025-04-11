import { Routes, Route } from 'react-router-dom';
import ChatBot from "./pages/ChatBot";


function App() {
  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <main className="p-4">
        <Routes>
          <Route path="/chatbot" element={<ChatBot />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;