import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaCog, FaHeart } from 'react-icons/fa';
import config from '../../config.json';
import './Profile.css';

const Profile = () => {
  const { username } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isCurrentUser, setIsCurrentUser] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        // Fetch user profile based on URL parameter
        const profileResponse = await fetch(`${config.serverRootURL}/getUserProfile/${username}`, {
          credentials: 'include'
        });

        if (!profileResponse.ok) {
          throw new Error('Failed to fetch profile');
        }

        const profileData = await profileResponse.json();
        setProfile(profileData);
        
        // Check if the viewed profile belongs to the logged-in user
        // This will help determine if we show edit buttons, etc.
        const currentUserResponse = await fetch(`${config.serverRootURL}/getUserProfile/${username}`, {
          credentials: 'include'
        });
        
        if (currentUserResponse.ok) {
          const currentUser = await currentUserResponse.json();
          setIsCurrentUser(currentUser.username === username);
        }
        console.log('Profile data:', profileData);

        // Fetch user posts
        const postsResponse = await fetch(`${config.serverRootURL}/getUserPosts/${username}`, {
          credentials: 'include'
        });

        if (!postsResponse.ok) {
          throw new Error('Failed to fetch posts');
        }

        const postsData = await postsResponse.json();
        setPosts(postsData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [username]);

  const handleSettingsClick = () => {
    navigate('/profile/edit/' + username);
  };

  if (loading) {
    return <div className="profile-loading">Loading profile...</div>;
  }

  if (error) {
    return <div className="profile-error">Error: {error}</div>;
  }

  return (
    <div className="profile-container">
      <div className="profile-header">
        <h1>Welcome, {profile.username}</h1>
        {isCurrentUser && (
          <button className="settings-button" onClick={handleSettingsClick}>
            <FaCog size={24} />
          </button>
        )}
      </div>
      
      <div className="profile-info">
        <div className="profile-image-container">
          {profile.profile_pic_link ? (
            <img 
              src={profile.profile_pic_link} 
              alt={`${profile.first_name}'s profile`} 
              className="profile-image" 
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
          ) : (
            <div className="profile-initial">
              {profile.first_name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        
        <div className="profile-details">
          <h2>{profile.first_name} {profile.last_name}</h2>
          
          <div className="profile-stats">
            <div className="stat-item">
              <span className="stat-label">Posts:</span>
              <span className="stat-value">{posts.length}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Followers:</span>
              <span className="stat-value">{profile.followers_count || 0}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Following:</span>
              <span className="stat-value">{profile.following_count || 0}</span>
            </div>
          </div>
          
          <div className="profile-personal-info">
            <div className="info-row">
              <span className="info-label">Birthday:</span>
              <span className="info-value">{new Date(profile.birthday).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Affiliation:</span>
              <span className="info-value">{profile.affiliation}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Interests:</span>
              <span className="info-value">
                {Array.isArray(profile.interests) && profile.interests.length > 0
                  ? profile.interests.join(', ') 
                  : (typeof profile.interests === 'string' && profile.interests.trim() !== ''
                      ? profile.interests 
                      : 'No interests added yet')}
              </span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="profile-posts">
        {posts.length === 0 ? (
          <p className="no-posts-message">No posts yet</p>
        ) : (
          <div className="posts-grid">
            {posts.map(post => (
              <div key={post.post_id} className="post-card">
                {post.image_link && (
                  <div className="post-image-container">
                    <img src={post.image_link} alt="Post content" className="post-image" />
                  </div>
                )}
                <div className="post-footer">
                  {post.title && <h3 className="post-title">{post.title}</h3>}
                  <div className="post-content">{post.content}</div>
                  <div className="post-likes">
                    <FaHeart /> {post.likes_count || 0}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;