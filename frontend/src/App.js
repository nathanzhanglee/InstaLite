import React from 'react';
import { Routes, Route } from 'react-router-dom';

function App() {
  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <Navbar />
      <main className="p-4">
        <Routes>
        </Routes>
      </main>
    </div>
  );
}

export default App;