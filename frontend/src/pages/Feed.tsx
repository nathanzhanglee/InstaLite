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
  comments?: Comment[]; // Add comments array
}

interface Comment {
  id: number;
  username: string;
  content: string;
  timestamp?: string;
}

const Feed: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [commentText, setCommentText] = useState<string>('');
  const [activeCommentPostId, setActiveCommentPostId] = useState<number | null>(null);

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${config.serverRootURL}/getFeed`, {
          withCredentials: true
        });
        
        const fetchedPosts = await Promise.all(response.data.map(async (post: any) => {
          try {
            // Get like status
            const likeResponse = await axios.get(
              `${config.serverRootURL}/checkLikeStatus?post_id=${post.id}`,
              { withCredentials: true }
            );
            
            // Get comments for this post
            const commentsResponse = await axios.get(
              `${config.serverRootURL}/getComments?post_id=${post.id}`,
              { withCredentials: true }
            );
            
            return {
              id: post.id,
              title: post.title,
              username: post.username,
              content: post.content,
              image_link: post.image_link || null,
              timestamp: post.timestamp || new Date().toISOString(),
              likes: post.likes || 0,
              comments: commentsResponse.data || []
            };
          } catch (err) {
            console.error("Error checking like status or comments:", err);
            return {
              ...post,
              likes: post.likes || 0,
              comments: []
            };
          }
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
      
      setPosts(posts.map(post => {
        if (post.id === postId) {
          return {
            ...post,
            likes: post.likes === 1 ? 0 : 1,
          };
        }
        return post;
      }));
    } catch (err) {
      console.error("Failed to like post:", err);
      setError("Failed to like post. Please try again.");
    }
  };

  const handleCommentSubmit = async (postId: number) => {
    if (!commentText.trim()) return;
    
    try {
      const response = await axios.post(
        `${config.serverRootURL}/createComment`,
        { 
          post_id: postId,
          content: commentText
        },
        { withCredentials: true }
      );
      // // Refresh comments for this post
      // const commentsResponse = await axios.get(
      //   `${config.serverRootURL}/getComments?post_id=${postId}`,
      //   { withCredentials: true }
      // );
      
      setPosts(posts.map(post => {
        if (post.id === postId) {
          return {
            ...post,
            comments: [
              {
                id: new Date().getTime(),  // You can generate a temporary ID or get it from the backend response
                username: 'Me',  // Replace this with the actual logged-in user's username
                content: commentText,
                timestamp: new Date().toISOString(),
              }
            ],
          };
        }
        return post;
      }));
      
      setCommentText('');
      setActiveCommentPostId(null);
    } catch (err) {
      console.error("Failed to post comment:", err);
      setError("Failed to post comment. Please try again.");
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
                <button 
                  className="comment-button"
                  onClick={() => setActiveCommentPostId(post.id === activeCommentPostId ? null : post.id)}
                >
                  💬 Comment
                </button>
              </div>

              {/* Comment input */}
              {activeCommentPostId === post.id && (
                <div className="comment-input-container">
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Write a comment..."
                    className="comment-input"
                  />
                  <button 
                    onClick={() => handleCommentSubmit(post.id)}
                    className="comment-submit-button"
                  >
                    Post
                  </button>
                </div>
              )}

              {/* Comments list */}
              {post.comments && post.comments.length > 0 && (
                <div className="comments-section">
                  {post.comments.map(comment => (
                    <div key={comment.id} className="comment">
                      <div className="comment-username">{comment.username}</div>
                      <div className="comment-content">{comment.content}</div>
                      {comment.timestamp && (
                        <div className="comment-timestamp">
                          {formatDate(comment.timestamp)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
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