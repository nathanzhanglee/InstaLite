import * as routes from './routes.js';
import multer from 'multer';

const max_profile_size = 5;      //max size of profile picture in MB

const pfp_upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: max_profile_size * 1024 * 1024 }
});

 //change the argument of pfp_upload to whatever the file is sent as in the frontend

function register_routes(app) {
    app.get('/chatbot', routes.getChatBot);
    app.post('/register', routes.registerUser);
    app.post('/setProfilePic', pfp_upload.single('profilePic'), routes.registerProfilePicture); 
  }

  
  export default register_routes;