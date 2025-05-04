import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Feed.css';

interface Post {
  id: number;
  username: string;
  content: string;
  image?: string;
  timestamp: string;
  likes: number;
}

const Feed: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(true);
  
  // Placeholder posts
  const [posts, setPosts] = useState<Post[]>([
    {
      id: 1,
      username: "john smith",
      content: "Hello! Test post here for now, please update me later.",
      image: "",
      timestamp: "2023-05-03T14:48:00",
      likes: 12
    }
  ]);

  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  const handleProfileClick = (username: string) => {
    navigate(`/profile/${username}`);
  };

  const formatDate = (dateString: string): string => {
    const options: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return new Date(dateString).toLocaleString('en-US', options);
  };

  if (loading) {
    return (
      <div className="feed-container">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading your feed...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="feed-container">
      <h1>Your Feed</h1>
      
      <div className="feed-posts">
        {posts.map(post => (
          <div key={post.id} className="post-card">
            <div className="post-header">
              <div 
                className="post-avatar" 
                onClick={() => handleProfileClick(post.username)}
              >
                {post.username.charAt(0).toUpperCase()}
              </div>
              <div className="post-metadata">
                <div 
                  className="post-username"
                  onClick={() => handleProfileClick(post.username)}
                >
                  {post.username}
                </div>
                <div className="post-timestamp">
                  {formatDate(post.timestamp)}
                </div>
              </div>
            </div>
            
            <div className="post-content">{post.content}</div>
            
            {post.image && (
              <div className="post-image-container">
                <img 
                  src={post.image} 
                  alt="Post content" 
                  className="post-image" 
                />
              </div>
            )}
            
            <div className="post-actions">
              <button className="like-button">
                ❤️ {post.likes}
              </button>
              <button className="comment-button">
                💬 Comment
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Feed;