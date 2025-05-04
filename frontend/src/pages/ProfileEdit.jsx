import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom'; // Added useParams
import { FaArrowLeft } from 'react-icons/fa';
import config from '../../config.json';
import './ProfileEdit.css';

const ProfileEdit = () => {
  const navigate = useNavigate();
  const { username } = useParams();
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  const [profile, setProfile] = useState({
    username: '',
    first_name: '',
    last_name: '',
    email: '',
    affiliation: '',
    birthday: '',
    interests: [],
    profile_pic_link: null
  });
  
  const [newProfilePic, setNewProfilePic] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [newInterest, setNewInterest] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        // Use username from URL params
        const response = await fetch(`${config.serverRootURL}/getUserProfile/${username}`, {
          credentials: 'include'
        });

        if (!response.ok) {
          throw new Error('Failed to fetch profile data');
        }

        const profileData = await response.json();
        
        // Format birthday for input field (YYYY-MM-DD)
        const formattedBirthday = profileData.birthday ? 
          new Date(profileData.birthday).toISOString().split('T')[0] : '';
          
        // Ensure interests is an array
        const interestsArray = Array.isArray(profileData.interests) ? 
          profileData.interests : 
          (typeof profileData.interests === 'string' ? 
            profileData.interests.split(',').map(i => i.trim()) : []);
            
        setProfile({
          ...profileData,
          birthday: formattedBirthday,
          interests: interestsArray
        });
        
        if (profileData.profile_pic_link) {
          setPreviewUrl(profileData.profile_pic_link);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (username) {
      fetchProfile();
    } else {
      setError("No username provided");
      setLoading(false);
    }
  }, [username]); // Add username as a dependency

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setProfile({
      ...profile,
      [name]: value
    });
  };

  const handleProfilePicChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setNewProfilePic(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const addInterest = () => {
    if (newInterest.trim() !== '') {
      let formattedInterest = newInterest.trim();
      if (!formattedInterest.startsWith('#')) {
        formattedInterest = `#${formattedInterest}`;
      }
      
      if (!profile.interests.includes(formattedInterest)) {
        setProfile({
          ...profile,
          interests: [...profile.interests, formattedInterest]
        });
      }
      
      setNewInterest('');
    }
  };

  const removeInterest = (indexToRemove) => {
    setProfile({
      ...profile,
      interests: profile.interests.filter((_, index) => index !== indexToRemove)
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Create form data for profile update
      const formData = new FormData();
      formData.append('username', profile.username || username); // Use either from state or params
      formData.append('first_name', profile.first_name);
      formData.append('last_name', profile.last_name);
      formData.append('email', profile.email);
      formData.append('affiliation', profile.affiliation);
      formData.append('birthday', profile.birthday);
      formData.append('interests', JSON.stringify(profile.interests));
      
      if (newProfilePic) {
        formData.append('profilePic', newProfilePic);
      }

      const response = await fetch(`${config.serverRootURL}/updateProfile`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update profile');
      }

      setSuccess('Profile updated successfully!');
      
      // Wait a moment to show success message before navigating
      setTimeout(() => {
        // Navigate to the profile page with updated URL structure
        navigate(`/profile/${profile.username || username}`);
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    navigate(`/profile/${username}`);
  };

  if (loading && !profile.first_name) {
    return <div className="profile-edit-loading">Loading profile data...</div>;
  }

  return (
    <div className="profile-edit-container">
      <div className="profile-edit-header">
        <button className="back-button" onClick={goBack}>
          <FaArrowLeft /> Back to Profile
        </button>
        <h1>Edit Profile</h1>
      </div>
      
      <form className="profile-edit-form" onSubmit={handleSubmit}>
        <div className="profile-pic-edit">
          <div className="profile-pic-preview">
            {previewUrl ? (
              <img src={previewUrl} alt="Profile preview" />
            ) : (
              <div className="profile-pic-placeholder">
                {profile.first_name ? profile.first_name.charAt(0).toUpperCase() : '?'}
              </div>
            )}
          </div>
          
          <div className="profile-pic-actions">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleProfilePicChange}
              accept="image/*"
              className="hidden-file-input"
            />
            <button 
              type="button" 
              className="secondary-button" 
              onClick={() => fileInputRef.current.click()}
            >
              Change Profile Picture
            </button>
          </div>
        </div>
        
        <div className="form-group">
          <label htmlFor="first_name">First Name</label>
          <input
            id="first_name"
            name="first_name"
            type="text"
            value={profile.first_name}
            onChange={handleInputChange}
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="last_name">Last Name</label>
          <input
            id="last_name"
            name="last_name"
            type="text"
            value={profile.last_name}
            onChange={handleInputChange}
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            value={profile.email}
            onChange={handleInputChange}
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="affiliation">Affiliation</label>
          <input
            id="affiliation"
            name="affiliation"
            type="text"
            value={profile.affiliation}
            onChange={handleInputChange}
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="birthday">Birthday</label>
          <input
            id="birthday"
            name="birthday"
            type="date"
            value={profile.birthday}
            onChange={handleInputChange}
            required
          />
        </div>
        
        <div className="form-group">
          <label>Interests/Hashtags</label>
          <div className="interests-container">
            {profile.interests.map((interest, index) => (
              <div key={index} className="interest-tag">
                {interest}
                <button 
                  type="button" 
                  className="remove-interest" 
                  onClick={() => removeInterest(index)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          
          <div className="add-interest">
            <input
              type="text"
              value={newInterest}
              onChange={(e) => setNewInterest(e.target.value)}
              placeholder="Add a new interest (e.g. music)"
            />
            <button 
              type="button" 
              className="add-interest-button"
              onClick={addInterest}
            >
              Add
            </button>
          </div>
        </div>
        
        {error && <div className="form-error">{error}</div>}
        {success && <div className="form-success">{success}</div>}
        
        <div className="form-actions">
          <button type="button" className="cancel-button" onClick={goBack}>
            Cancel
          </button>
          <button type="submit" className="save-button" disabled={loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProfileEdit;