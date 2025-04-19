// test-compile.js - basic file that compiles the backend code to check for syntax errors

import * as routes from './backend/routes/routes.js';
import * as registerRoutes from './backend/routes/register_routes.js';

const mockImageFile = {
  fieldname: 'postImage',
  originalname: 'test.jpg',
  encoding: '7bit',
  mimetype: 'image/jpeg',
  buffer: Buffer.from([0xFF, 0xD8, 0xFF]), // Simple mock of JPEG header
  size: 3
};

//empty now
const mockRequest = {
  body: {
    username: 'testuser',
    email: 'test@testuser.com',
    fname: 'testfname',
    lname: 'testlname',
    password: 'testpassword',
    birthday: '2001-09-01',
    affiliation: 'upenn-nets'
  },
  session: {
    user_id: 305
  },
  file: mockImageFile,
};

const mockResponse = {
  status: (code) => ({
    json: (data) => console.log(`Response status: ${code}, data:`, data),
  }),
  send: (data) => console.log('Response sent:', data),
}

async function runSuite() {
  try {
    await routes.registerUser(mockRequest, mockResponse);
    await routes.postLogin(mockRequest, mockResponse);
    await routes.createOrGetChat(mockRequest, mockResponse);
    await routes.getChatBot(mockRequest, mockResponse);
    await routes.postAddFriend(mockRequest, mockResponse);
    await routes.postRemoveFriend(mockRequest, mockResponse);
    await routes.getFriends(mockRequest, mockResponse);
    await routes.createPost(mockRequest, mockResponse);
    await routes.sendMessageExistingChat(mockRequest, mockResponse);
    await routes.registerProfilePicture(mockRequest, mockResponse);
    await routes.getChatMessages(mockRequest, mockResponse);
    await routes.getChatInvites(mockRequest, mockResponse);
    await routes.sendChatInvite(mockRequest, mockResponse);
    await routes.acceptChatInvite(mockRequest, mockResponse);
    await routes.rejectChatInvite(mockRequest, mockResponse);
    await routes.postLogout(mockRequest, mockResponse);

    // These should throw if there are syntax errors
    console.log('\n Both the routes and register routes files compiled successfully!\n');
  } catch (error) {
    console.error('Compilation error:', error);
    process.exit(1);
  }
}
//you can change mock properties in between invocations of runSuite (invented jest lite, wow)

await runSuite();
process.exit(0); //success