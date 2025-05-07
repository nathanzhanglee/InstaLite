import React, { useState, useRef, ChangeEvent, FormEvent } from 'react';
import axios, { AxiosError } from 'axios';
import config from '../../../config.json';
import { useParams } from 'react-router-dom';

function CreatePostComponent() {
  const [title, setTitle] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { username } = useParams<{ username: string }>();

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setImage(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const clearImage = () => {
    setImage(null);
    setPreviewUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      // Use FormData to support file uploads
      const formData = new FormData();
      formData.append('title', title);
      formData.append('content', content);
      
      if (image) {
        formData.append('postImage', image);
      }
      
      const response = await axios.post(`${config.serverRootURL}/createPost`, formData, {
        withCredentials: true,
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      if (response.status === 201 || response.status === 200) {
        // Clear input fields
        setTitle('');
        setContent('');
        clearImage();
        // Update posts if needed
        //updatePosts();
      }
    } catch (error: unknown) {
      console.error('Error creating post:', error);
      
      let errorMessage = 'Unknown error occurred';
      
      if (axios.isAxiosError(error)) {
        errorMessage = error.response?.data?.error || error.message || errorMessage;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      alert(`Failed to create post: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center p-4">
      <div className="w-full max-w-lg">
        <form className="bg-white rounded-lg shadow-md p-6" onSubmit={handleSubmit}>
          <h2 className="text-2xl font-bold text-center mb-6 text-indigo-700">Create Post</h2>
          
          <div className="mb-4">
            <label htmlFor="title" className="block text-gray-700 font-semibold mb-2">Title</label>
            <input 
              id="title" 
              type="text" 
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={title} 
              onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
              placeholder="Enter post title"
              required
            />
          </div>
          
          <div className="mb-4">
            <label htmlFor="content" className="block text-gray-700 font-semibold mb-2">Content</label>
            <textarea
              id="content"
              value={content}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              rows={4}
              placeholder="Write your post content"
              required
            ></textarea>
          </div>
          
          <div className="mb-6">
            <label className="block text-gray-700 font-semibold mb-2">Image (Optional)</label>
            
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
            />
            
            {previewUrl ? (
              <div className="mt-2 relative">
                <img 
                  src={previewUrl} 
                  alt="Preview" 
                  className="w-full h-48 object-cover rounded-md" 
                />
                <button
                  type="button"
                  onClick={clearImage}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-32 border-2 border-dashed border-gray-300 rounded-md flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500"
              >
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                </svg>
                <span className="mt-2 text-gray-500">Click to upload image</span>
              </div>
            )}
          </div>
          
          <div className="flex justify-center">
            <button
              type="submit"
              disabled={isLoading}
              className={`px-6 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors
                ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {isLoading ? 'Creating...' : 'Create Post'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreatePostComponent;
