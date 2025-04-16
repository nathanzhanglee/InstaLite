import express from 'express';
import fs from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';
import register_routes from './routes/register_routes.js';
import session from 'express-session';

// Simple approach to determine config file path
const configPath = fs.existsSync('./config/config.json') 
  ? './config/config.json'           // Running from backend folder
  : 'backend/config/config.json';    // Running from root folder
const configFile = fs.readFileSync(configPath, 'utf8');

dotenv.config();
const config = JSON.parse(configFile);

const app = express();
const port = config.serverPort;

var host = process.env.SITE_HOST; // Use SITE_HOST from .env

app.use(cors({
  origin: (host == null ? 'http://localhost:4567' : host),
  methods: ['POST', 'PUT', 'GET', 'OPTIONS', 'HEAD'],
  credentials: true
}));
app.use(express.json());

app.use(session({
  secret: 'nets2120_insecure', saveUninitialized: true, cookie: { httpOnly: false }, resave: true
}));


register_routes(app);

app.listen(port, () => {
  console.log(`Main app listening on port ${port}`)
})