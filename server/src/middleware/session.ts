import session from 'express-session';
import { createClient } from 'redis';
import { RedisStore } from 'connect-redis';
import { Request, Response, NextFunction } from 'express';

// Load session secret from environment variables
const SESSION_SECRET = process.env.SESSION_SECRET || 'your-very-secure-session-secret'; // Default for dev only!
const SESSION_MAX_AGE = parseInt(process.env.SESSION_MAX_AGE || '604800000'); // Default to 7 days (in milliseconds)

// Initialize Redis client
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => {
  console.error('Redis client error:', err);
});

// Connect to Redis
redisClient.connect().catch((err) => {
  console.error('Failed to connect to Redis:', err);
});

// Type definition to safely extend express-session types
declare module 'express-session' {
  interface SessionData {
    user?: {
      sub: string;         // Google user ID
      email: string;       // User email
      name?: string;       // User name if available
      picture?: string;    // Profile picture URL if available
    };
    isAuthenticated: boolean;
  }
}

// Initialize RedisStore
const redisStore = new RedisStore({
  client: redisClient,
  prefix: 'audacy-sess:',  // Custom prefix to avoid conflicts with other apps
  ttl: SESSION_MAX_AGE / 1000, // Convert milliseconds to seconds for Redis TTL
});

// Configure session middleware
export const sessionMiddleware = session({
  store: redisStore,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // use secure cookies in production
    httpOnly: true,                               // prevent client-side JS from reading
    maxAge: SESSION_MAX_AGE,                      // session duration in ms (7 days)
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' // CSRF protection
  }
});

// Helper middleware to check if user is authenticated
export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.session.isAuthenticated && req.session.user) {
    return next();
  }
  
  res.status(401).json({ message: 'Authentication required. Please log in.' });
}; 