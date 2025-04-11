import * as routes from './routes.js';

function register_routes(app) {
    app.get('/chatbot', routes.getChatBot);
  }
  
  export default register_routes;