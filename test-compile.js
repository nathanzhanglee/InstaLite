// test-compile.js - basic file that compiles the backend code to check for syntax errors
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import * as routes from './backend/routes/routes.js';
import * as registerRoutes from './backend/routes/register_routes.js';

function loadImage(imagePath) {
  const fullPath = path.resolve(process.cwd(), imagePath);
  const img = fs.readFileSync(fullPath);
  const stats = fs.statSync(fullPath);
  const filename = path.basename(fullPath);
  const imageMimeType = mime.lookup(fullPath);

  return {
    fieldname: 'postImage',
    originalname: filename,
    encoding: '7bit',
    mimetype: imageMimeType,
    buffer: img,
    size: stats.size
  }
}

const mockImageFile = loadImage('images/bernie.jpg');

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

let returnedResponseData; //can hold as needed

const mockResponse = {
  status: (code) => ({
    json: (data) => {
      console.log(`Response status: ${code}, data:`, data);
      returnedResponseData = data;
    }
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
  } catch (error) {
    console.error('Compilation error:', error);
    process.exit(1);
  }
}
//you can change mock properties in between invocations of runSuite (invented jest lite, wow)
const testFunctions1 = [routes.registerUser, routes.postLogin, routes.createOrGetChat,
  routes.getChatBot, routes.postAddFriend, routes.postRemoveFriend,
  routes.getFriends, routes.createPost, routes.sendMessageExistingChat, routes.registerProfilePicture];
const testFunctions2 = [routes.associateWithActor, routes.getChatMessages,
  routes.getChatInvites, routes.sendChatInvite, routes.acceptChatInvite,
  routes.rejectChatInvite, routes.postLogout];

await runSuite(testFunctions1, mockRequest, mockResponse);

// Test the pipeline between profile pic registration and actor association
let actorNconst = 'nm0084690';
let actorName = 'Jacques Bizeul';

// hardcoded for now, note that this test may fail as long as our 'names' table 
// and ChromaDB are somewhat mismatched
//we can think about how to synchronize them, perhaps with the populateChroma() function

/*
const actorMatches = returnedResponseData.top_matches;
console.log("Actor results: ",actorMatches);
if (!actorMatches || actorMatches.length === 0) {
  console.log("Actor results are empty, test failed");
} else {
  actorNconst = actorMatches[0].nconst;
  console.log("Actor nconst:", actorNconst);
  mockRequest.body.selectedActor = actorNconst;
}
*/

mockRequest.body.selectedActorNconst = actorNconst;
mockRequest.body.selectedActorName = actorName;

await runSuite(testFunctions2, mockRequest, mockResponse);
process.exit(0);