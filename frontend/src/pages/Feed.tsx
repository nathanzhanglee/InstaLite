import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Feed.css';
import config from '../../config.json';
import axios from 'axios';

interface Post {
  id: number;
  title?: string;
  username: string;
  content: string;
  image_link?: string;
  timestamp?: string;
  likes?: number;
}

const Feed: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${config.serverRootURL}/getFeed`, {
          withCredentials: true
        });
        
        const fetchedPosts = response.data.map((post: any) => ({
          id: post.id,
          title: post.title,
          username: post.username,
          content: post.content,
          image_link: post.image_link || null,
          timestamp: post.timestamp || new Date().toISOString(),
          likes: post.likes || 0
        }));
        
        setPosts(fetchedPosts);
        setError(null);
      } catch (err) {
        console.error("Failed to fetch posts:", err);
        setError("Failed to load posts. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
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

  if (error) {
    return (
      <div className="feed-container">
        <div className="error-message">
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="feed-container">
      <h1>Your Feed</h1>
      
      <div className="feed-posts">
        {posts.length > 0 ? (
          posts.map(post => (
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
                  {post.timestamp && (
                    <div className="post-timestamp">
                      {formatDate(post.timestamp)}
                    </div>
                  )}
                </div>
              </div>
              
              {post.title && <h3 className="post-title">{post.title}</h3>}
              <div className="post-content">{post.content}</div>
              
              {post.image_link && (
                <div className="post-image-container">
                  <img 
                    src={post.image_link} 
                    alt="Post content" 
                    className="post-image" 
                  />
                </div>
              )}
              
              <div className="post-actions">
                <button className="like-button">
                  ❤️ {post.likes || 0}
                </button>
                <button className="comment-button">
                  💬 Comment
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="no-posts-message">
            <p>No posts to show right now. Follow more users or check back later!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Feed;