import React from 'react';
import {useState, useEffect} from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios'; 
import config from '../../config.json';
import CreatePostComponent from '../components/Post/CreatePostComponent';

const HomePage = () => {
  return (
    <div className="min-h-screen bg-gray-100">
      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <CreatePostComponent />
        </div>
      </main>
    </div>
  );
};

export default HomePage;