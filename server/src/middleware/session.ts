import session from 'express-session';
import FileStoreFactory from 'session-file-store';
import { Request, Response, NextFunction } from 'express';
import path from 'path'; // Import path module

// Create FileStore instance
const FileStore = FileStoreFactory(session);

// Load session secret from environment variables
const SESSION_SECRET = process.env.SESSION_SECRET || 'your-very-secure-session-secret'; // Default for dev only!
const SESSION_MAX_AGE = parseInt(process.env.SESSION_MAX_AGE || '604800000'); // Default to 7 days (in milliseconds)

// Define the session storage path - MUST match Render Disk Mount Path
const sessionStorePath = process.env.SESSION_PATH || path.join(__dirname, '..', '..', 'sessions'); // Default to local 'sessions' folder if not on Render
console.log(`Session store path configured to: ${sessionStorePath}`);

// Initialize FileStore with options
const fileStoreOptions = {
  path: sessionStorePath,
  ttl: SESSION_MAX_AGE / 1000, // Convert ms to seconds for TTL
  retries: 0, // Number of retries for reading/writing session files
  logFn: console.log // Optional: Log file store activity
};

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

// Configure session middleware
export const sessionMiddleware = session({
  store: new FileStore(fileStoreOptions),
  secret: SESSION_SECRET,
  resave: false, // Don't save session if unmodified
  saveUninitialized: false, // Don't create session until something stored
  cookie: {
    secure: process.env.NODE_ENV === 'production', // use secure cookies in production
    httpOnly: true,                               // prevent client-side JS from reading
    maxAge: SESSION_MAX_AGE,                      // session duration in ms (7 days)
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' // CSRF protection - 'none' might be needed for cross-site requests in production
  }
});

// Helper middleware to check if user is authenticated
export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.session.isAuthenticated && req.session.user) {
    return next();
  }
  
  res.status(401).json({ message: 'Authentication required. Please log in.' });
}; 