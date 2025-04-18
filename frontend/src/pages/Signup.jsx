import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios'; 
import config from '../../config.json';
import './Signup.css';

export default function Signup() {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [birthday, setBirthday] = useState('');
    const [affiliation, setAffiliation] = useState('');
    
    // Profile picture
    const [profilePic, setProfilePic] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');
    
    // Actor matching
    const [topMatches, setTopMatches] = useState([]);
    const [selectedActor, setSelectedActor] = useState(null);
    
    // Interests/hashtags
    const [interests, setInterests] = useState([]);
    const [newInterest, setNewInterest] = useState('');
    const [popularTags, setPopularTags] = useState(['#penn', '#nets2120', '#upenn', '#cis', '#computer_science', '#philadelphia', '#ivy_league', '#tech', '#coding', '#student']);
    
    // Multi-step form
    const [currentStep, setCurrentStep] = useState(1);

    const rootURL = config.serverRootURL;

   // profile picture selection
    const handlePictureChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setProfilePic(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    // adding interests/hashtags
    const addInterest = () => {
        if (newInterest.trim() !== '') {
            if (!newInterest.startsWith('#')) {
                setInterests([...interests, `#${newInterest.trim()}`]);
            } else {
                setInterests([...interests, newInterest.trim()]);
            }
            setNewInterest('');
        }
    };

    // removing interests/hashtags
    const removeInterest = (index) => {
        setInterests(interests.filter((_, i) => i !== index));
    };

    // Add popular tag to interests
    const addPopularTag = (tag) => {
        if (!interests.includes(tag)) {
            setInterests([...interests, tag]);
        }
    };

    const nextStep = () => {
        if (currentStep === 1) {
            if (!username || !email || !firstName || !lastName || !password || !confirmPassword || !birthday || !affiliation) {
                alert('Please fill all required fields');
                return;
            }
            
            if (password !== confirmPassword) {
                alert('Passwords do not match');
                return;
            }
        }
        
        if (currentStep === 2 && !profilePic) {
            alert('Please upload a profile picture');
            return;
        }
        
        setCurrentStep(currentStep + 1);
    };

    const prevStep = () => {
        setCurrentStep(currentStep - 1);
    };

    // upload profile picture
    const uploadProfilePic = async () => {
        try {
            const formData = new FormData();
            formData.append('profilePic', profilePic);
            
            const response = await axios.post(`${rootURL}/setProfilePic`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                },
                withCredentials: true
            });
            
            setTopMatches(response.data.top_matches || []);
            setCurrentStep(3);
        } catch (error) {
            console.error('Error uploading profile picture:', error);
            alert('Failed to upload profile picture: ' + (error.response?.data?.error || 'Unknown error'));
        }
    };

    // form submission
    const handleSubmit = async (event) => {
        event.preventDefault();
        
        try {
            // First register the user
            const response = await axios.post(`${rootURL}/register`, {
                username,
                email,
                fname: firstName,
                lname: lastName,
                password,
                birthday,
                affiliation,
                interests: interests.join(',')
            });
            
            // Use response data and proceed to next step
            if (profilePic) {
                // If they already uploaded a photo, move to step 2
                nextStep();
            } else {
                // Otherwise go to homepage
                alert('Welcome ' + username + '!');
                navigate(`/${username}/home`);
            }
        } catch (error) {
            console.error('Registration error:', error);
            alert('Registration failed: ' + (error.response?.data?.error || 'Unknown error'));
        }
    };

    // Select an actor from matches
    const selectActor = async (actorId) => {
        try {
            setSelectedActor(actorId);
            
            await axios.post(`${rootURL}/linkActor`, {
                actorId
            }, {
                withCredentials: true
            });
            alert('Registration complete! Welcome ' + username + '!');
            navigate(`/${username}/home`);
        } catch (error) {
            console.error('Error linking actor:', error);
            alert('Failed to link actor: ' + (error.response?.data?.error || 'Unknown error'));
        }
    };

    // Signup Step 1: basic info
    const renderStep1 = () => (
        <div className='signup-form'>
            <div className='signup-title'>Create Your Account</div>
            
            <div className='signup-input-row'>
                <label htmlFor="username">Username*</label>
                <input
                    id="username"
                    type="text"
                    className='signup-input'
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                />
            </div>
            
            <div className='signup-input-row'>
                <label htmlFor="email">Email Address*</label>
                <input
                    id="email"
                    type="email"
                    className='signup-input'
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                />
            </div>
            
            <div className='signup-input-row'>
                <label htmlFor="firstName">First Name*</label>
                <input
                    id="firstName"
                    type="text"
                    className='signup-input'
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                />
            </div>
            
            <div className='signup-input-row'>
                <label htmlFor="lastName">Last Name*</label>
                <input
                    id="lastName"
                    type="text"
                    className='signup-input'
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                />
            </div>
            
            <div className='signup-input-row'>
                <label htmlFor="password">Password*</label>
                <input
                    id="password"
                    type="password"
                    className='signup-input'
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                />
            </div>
            
            <div className='signup-input-row'>
                <label htmlFor="confirmPassword">Confirm Password*</label>
                <input
                    id="confirmPassword"
                    type="password"
                    className='signup-input'
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                />
            </div>
            
            <div className='signup-input-row'>
                <label htmlFor="birthday">Birthday*</label>
                <input
                    id="birthday"
                    type="date"
                    className='signup-input'
                    value={birthday}
                    onChange={(e) => setBirthday(e.target.value)}
                    required
                />
            </div>
            
            <div className='signup-input-row'>
                <label htmlFor="affiliation">Affiliation*</label>
                <input
                    id="affiliation"
                    type="text"
                    className='signup-input'
                    placeholder="e.g. University of Pennsylvania"
                    value={affiliation}
                    onChange={(e) => setAffiliation(e.target.value)}
                    required
                />
            </div>
            
            <button type="button" className='signup-button' onClick={handleSubmit}>
                Continue
            </button>
        </div>
    );

    // Signup step 2: Profile picture
    const renderStep2 = () => (
        <div className='signup-form'>
            <div className='signup-title'>Upload Your Profile Picture</div>
            
            <div className='flex flex-col items-center justify-center space-y-4'>
                {previewUrl && (
                    <div className='w-40 h-40 rounded-full overflow-hidden'>
                        <img src={previewUrl} alt="Profile preview" className='w-full h-full object-cover' />
                    </div>
                )}
                
                <input 
                    type="file" 
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handlePictureChange}
                    className="hidden"
                />
                
                <button 
                    type="button" 
                    onClick={() => fileInputRef.current.click()}
                    className='px-4 py-2 bg-blue-500 text-white rounded-md'
                >
                    {previewUrl ? 'Change Picture' : 'Select Picture'}
                </button>
                
                <p className='text-sm text-gray-500'>Upload a picture to find similar actors</p>
            </div>
            
            <div className='flex justify-between mt-6'>
                <button type="button" className='px-4 py-2 bg-gray-300 rounded-md' onClick={prevStep}>
                    Back
                </button>
                <button type="button" className='px-4 py-2 bg-blue-500 text-white rounded-md' onClick={uploadProfilePic}>
                    Continue
                </button>
            </div>
        </div>
    );

    // Signup step 3: Actor matching
    const renderStep3 = () => (
        <div className='signup-form'>
            <div className='signup-title'>Choose a Celebrity Look-alike</div>
            
            {topMatches.length === 0 ? (
                <div className='text-center py-4'>
                    <p>No matches found. You're unique!</p>
                    <button 
                        type="button" 
                        className='px-4 py-2 bg-blue-500 text-white rounded-md mt-4'
                        onClick={() => {
                            alert('Welcome ' + username + '!');
                            navigate(`/${username}/home`);
                        }}
                    >
                        Continue to Homepage
                    </button>
                </div>
            ) : (
                <div className='grid grid-cols-2 md:grid-cols-3 gap-4'>
                    {topMatches.map((match, index) => (
                        <div 
                            key={index} 
                            className={`p-2 border rounded-md cursor-pointer ${selectedActor === match.id ? 'border-blue-500 bg-blue-50' : ''}`}
                            onClick={() => selectActor(match.id)}
                        >
                            <div className='w-full aspect-square overflow-hidden rounded-md'>
                                <img src={match.image_url} alt={match.name} className='w-full h-full object-cover' />
                            </div>
                            <p className='text-center mt-2 font-medium'>{match.name}</p>
                        </div>
                    ))}
                </div>
            )}
            
            <div className='flex justify-between mt-6'>
                <button type="button" className='px-4 py-2 bg-gray-300 rounded-md' onClick={prevStep}>
                    Back
                </button>
                <button 
                    type="button" 
                    className='px-4 py-2 bg-blue-500 text-white rounded-md' 
                    onClick={() => {
                        if (selectedActor) {
                            navigate(`/${username}/home`);
                        } else {
                            alert('Please select a celebrity or skip');
                        }
                    }}
                >
                    {selectedActor ? 'Continue' : 'Skip'}
                </button>
            </div>
        </div>
    );

    // Signup step 4: Interests
    const renderStep4 = () => (
        <div className='signup-form'>
            <div className='signup-title'>Add Your Interests</div>
            
            <div className='mb-4'>
                <p className='text-gray-600 mb-2'>Popular hashtags:</p>
                <div className='flex flex-wrap gap-2'>
                    {popularTags.map((tag, index) => (
                        <span 
                            key={index}
                            className='px-3 py-1 bg-gray-200 hover:bg-blue-200 rounded-full cursor-pointer'
                            onClick={() => addPopularTag(tag)}
                        >
                            {tag}
                        </span>
                    ))}
                </div>
            </div>
            
            <div className='mb-4'>
                <p className='text-gray-600 mb-2'>Your interests:</p>
                <div className='flex flex-wrap gap-2'>
                    {interests.map((interest, index) => (
                        <span key={index} className='px-3 py-1 bg-blue-100 rounded-full flex items-center'>
                            {interest}
                            <button 
                                type='button'
                                className='ml-2 text-red-500'
                                onClick={() => removeInterest(index)}
                            >
                                &times;
                            </button>
                        </span>
                    ))}
                </div>
            </div>
            
            <div className='flex space-x-2'>
                <input
                    type="text"
                    className='signup-input'
                    placeholder="Add interest (e.g. coding)"
                    value={newInterest}
                    onChange={(e) => setNewInterest(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addInterest()}
                />
                <button 
                    type="button" 
                    className='px-4 py-2 bg-blue-500 text-white rounded-md'
                    onClick={addInterest}
                >
                    Add
                </button>
            </div>
            
            <div className='flex justify-between mt-6'>
                <button type="button" className='px-4 py-2 bg-gray-300 rounded-md' onClick={prevStep}>
                    Back
                </button>
                <button 
                    type="button" 
                    className='px-4 py-2 bg-blue-500 text-white rounded-md'
                    onClick={async () => {
                        try {
                            await axios.post(`${rootURL}/updateInterests`, {
                                interests: interests.join(',')
                            }, {
                                withCredentials: true
                            });
                            
                            alert('Profile complete! Welcome ' + username + '!');
                            navigate(`/${username}/home`);
                        } catch (error) {
                            console.error('Error updating interests:', error);
                            alert('Failed to update interests: ' + (error.response?.data?.error || 'Unknown error'));
                        }
                    }}
                >
                    Finish
                </button>
            </div>
        </div>
    );

    return (
        <div className='signup-container'>
            <h1 className="welcome-title">Welcome to Pennstagram!</h1>
            <form onSubmit={(e) => e.preventDefault()}>
                {currentStep === 1 && renderStep1()}
                {currentStep === 2 && renderStep2()}
                {currentStep === 3 && renderStep3()}
                {currentStep === 4 && renderStep4()}
            </form>
        </div>
    );
}