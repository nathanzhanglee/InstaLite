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
  cookies: {}
};

const mockResponse = {
  status: (code) => ({
    json: (data) => console.log(`Response status: ${code}, data:`, data)
  }),
  send: (data) => console.log('Response sent:', data),
  clearCookie: (cookieName, options) => {
    if (mockRequest.cookies[cookieName]) {
      delete mockRequest.cookies[cookieName];
      console.log(`Cookie ${cookieName} cleared`);
    } else {
      console.log(`Cookie ${cookieName} not found`);
    }
  },
  cookie: (cookieName, cookieValue, options) => 
    {
      mockRequest.cookies[cookieName] = cookieValue
    }
}

async function runSuite(funcArray, ...params) {
  try {
    for (const func of funcArray) {
      console.log("Running function:", func.name);
      await func(...params);
      console.log();
    }
    console.log('\n Both the routes and register routes files compiled successfully!\n');
    process.exit(0); //success
  } catch (error) {
    console.error('Compilation error:', error);
    process.exit(1);
  }
}
//you can change mock properties in between invocations of runSuite (invented jest lite, wow)
const testFunctions = [routes.registerUser, routes.postLogin, routes.createOrGetChat,
  routes.getChatBot, routes.postAddFriend, routes.postRemoveFriend,
  routes.getFriends, routes.createPost, routes.sendMessageExistingChat,
  routes.registerProfilePicture, routes.getChatMessages,
  routes.getChatInvites, routes.sendChatInvite, routes.acceptChatInvite,
  routes.rejectChatInvite, routes.postLogout
];
await runSuite(testFunctions, mockRequest, mockResponse);