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
  // Removed isLiked from here
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
        
        const fetchedPosts = await Promise.all(response.data.map(async (post: any) => {
          try {
            const likeResponse = await axios.get(
              `${config.serverRootURL}/checkLikeStatus?post_id=${post.id}`,
              { withCredentials: true }
            );
          } catch (err) {
            console.error("Error checking like status:", err);
          }
          
          return {
            id: post.id,
            title: post.title,
            username: post.username,
            content: post.content,
            image_link: post.image_link || null,
            timestamp: post.timestamp || new Date().toISOString(),
            likes: post.likes || 0,
          };
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

  const handleLikeClick = async (postId: number) => {
    try {
      const response = await axios.post(
        `${config.serverRootURL}/likePost`,
        { post_id: postId },
        { withCredentials: true }
      );
      console.log('Response from likePost:', response);  // Log the response from backend
  
      // Toggle the like count between 0 and 1 for each post
      setPosts(posts.map(post => {
        if (post.id === postId) {
          console.log('Post updated:', { ...post, likes: post.likes === 1 ? 0 : 1 });  // Log post update
          return {
            ...post,
            likes: post.likes === 1 ? 0 : 1, // Toggle between 0 and 1
          };
        }
        return post;
      }));
      
    } catch (err) {
      console.error("Failed to like post:", err);
      setError("Failed to like post. Please try again.");
    }
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
                    src="https://directory.seas.upenn.edu/wp-content/uploads/2020/03/ives-zack.jpg}"
                    // src={post.image_link} 
                    alt="Post content" 
                    className="post-image" 
                  />
                </div>
              )}
              
              <div className="post-actions">
                <button 
                  className={`like-button ${post.likes === 1 ? 'liked' : ''}`}
                  onClick={() => handleLikeClick(post.id)}
                >
                  {post.likes === 1 ? '❤️' : '🤍'} {post.likes}
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
