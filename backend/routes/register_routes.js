import fs from 'fs';
import * as routes from './routes.js';
import multer from 'multer';

// Simple approach to determine config file path
const configPath = fs.existsSync('./config/config.json') 
  ? './config/config.json'           // Running from backend folder
  : 'backend/config/config.json';    // Running from root folder
const configFile = fs.readFileSync(configPath, 'utf8');
const config = JSON.parse(configFile);
const defaultMaxSize = config.socialParams.fileDefaultMaxSize;      //default max size of file in MB

const IMAGE_CONFIG = {
  PROFILE: {
    maxSize: 2, // 2MB
    destination: 'profile-pics',
    fieldName: 'profilePic'
  },
  POST: {
    maxSize: 5, // 5MB
    destination: 'post-images',
    fieldName: 'postImage'
  },
  MESSAGE: {
    maxSize: 7, // 7MB to allow for documents as well
    destination: 'message-attachments',
    fieldName: 'messageAttachment',
    acceptedTypes: ['application/pdf', 'text/plain', 'text/csv']
  }
};

function createUploader(options = {}) {
  return multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: (options.maxSize || defaultMaxSize) * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if ((options.acceptAllImages && file.mimetype.startsWith('image/')) || options.acceptedTypes?.includes(file.mimetype)) {
        // EITHER acceptAllImages + file is any image/* MIME type OR if the file type is in the allowed list, then accept
        cb(null, true);
      } else {
        // Throw an error
        cb(new Error(`Only ${options.fileTypesMessage || 'images'} are allowed`), false);
      }
    }
  });
}

/**
 * Higher-order function to handle image uploads with error handling
 * @param {Object} imageConfig - Configuration for this image type
 * @param {Function} handler - The route handler function
 * @returns {Function} Express middleware function
 */
function handleFileUpload(imageConfig, handler) {
  const uploader = createUploader({
    maxSize: imageConfig.maxSize,
    acceptedTypes: imageConfig.acceptedTypes,
    acceptAllImages: true,
  });
  
  return (req, res, next) => {
    const uploadMiddleware = uploader.single(imageConfig.fieldName);
    
    uploadMiddleware(req, res, (err) => {
      if (err) {
        // Handle Multer errors
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ 
              error: `File is too large. Maximum size is ${imageConfig.maxSize}MB.` 
            });
          } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
              error: `Unexpected field name. Use '${imageConfig.fieldName}'.`
            });
          }
          return res.status(400).json({ error: `Multer error: ${err.message}` });
        }
        
        // Handle validation errors from fileFilter
        return res.status(400).json({ error: err.message });
      }
      
      // Now just pass control to the route handler without adding anything to req
      handler(req, res, next);
    });
  };
}

// Setup multer for profile picture uploads
const profilePicStorage = multer.memoryStorage();
const profilePicUpload = multer({
  storage: profilePicStorage,
  limits: { fileSize: 5 * 1024 * 1024 }
}).single('profilePic');

function register_routes(app) {
  app.post('/register', 
    handleFileUpload(IMAGE_CONFIG.PROFILE, routes.registerUser));   //adapt to the all-in-one registration aspect
  app.post('/login', routes.postLogin);
  app.post('/getActorMatches', routes.getActorMatches);

  //password reset routes
  app.post('/forgotPassword', routes.forgotPassword);
  app.post('/resetPassword', routes.resetPassword);

  app.use(routes.authenticateRequest);     
  //!!! NOTE: this is middleware. anything after this will use authentication

  app.post('/search', routes.getChatBot);
  app.post('/logout', routes.postLogout);
  app.post('/addFriend', routes.postAddFriend);
  app.post('/removeFriend', routes.postRemoveFriend);
  app.get('/getFriends', routes.getFriends);
  app.get('/messages', routes.getChatMessages);
  app.post('/sendInvite', routes.sendChatInvite);
  app.post('/associate', routes.associateWithActor);
  app.get('/getUserProfile/:username', routes.getUserProfile);
  app.get('/getUserPosts/:username', routes.getUserPosts);
  app.post('/updateProfile', profilePicUpload, routes.updateProfile);

  // Chat Routes
  app.post('/createChatRoom', routes.createChatRoom);
  app.get('/chatRooms', routes.getChatRooms);
  app.get('/chatMembers/:chatId', routes.getChatMembers);
  app.get('/messages/:chatId', routes.getChatMessages);
  app.post('/sendMessage', routes.sendChatMessage);
  app.post('/sendChatInvite', routes.sendChatInvite);
  app.get('/chatInvites', routes.getChatInvites);
  app.post('/respondToChatInvite', routes.respondToChatInvite);
  app.post('/leaveChatRoom', routes.leaveChatRoom);

  // Image upload routes
  app.post('/setProfilePic', 
    handleFileUpload(IMAGE_CONFIG.PROFILE, routes.registerProfilePicture)
  );
  
  app.post('/createPost', 
    handleFileUpload(IMAGE_CONFIG.POST, routes.createPost)
  );


  app.post('/sendMessage', 
    handleFileUpload(IMAGE_CONFIG.MESSAGE, routes.sendMessageExistingChat)
  );
  app.post('/updateActivity', routes.postUpdateActivity);
}

  
  export default register_routes;