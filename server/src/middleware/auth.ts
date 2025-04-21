import { Request, Response, NextFunction } from 'express';
import { OAuth2Client, TokenPayload } from 'google-auth-library';

// Load Google Client ID from environment variables (important for security)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

if (!GOOGLE_CLIENT_ID) {
  console.error('FATAL ERROR: GOOGLE_CLIENT_ID environment variable is not set.');
  process.exit(1); // Exit if the client ID is not configured
}

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// Extend Express Request interface to include user property
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload; // Add user property to store verified user payload
    }
  }
}

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (token == null) {
    console.log('Auth Error: No token provided');
    return res.status(401).json({ message: 'Authentication required: No token provided' });
  }

  try {
    console.log('Verifying token...');
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      console.log('Auth Error: Invalid token - no payload');
      return res.status(403).json({ message: 'Authentication failed: Invalid token' });
    }

    // Optional: Check if the token is expired (library usually handles this, but good practice)
    const expiryDate = payload.exp;
    if (expiryDate && expiryDate * 1000 < Date.now()) {
        console.log('Auth Error: Token expired');
        return res.status(401).json({ message: 'Authentication failed: Token expired' });
    }

    console.log('Token verified successfully for user:', payload.email);
    req.user = payload; // Attach user payload to the request object
    next(); // Proceed to the next middleware or route handler

  } catch (error) {
    console.error('Auth Error: Token verification failed:', error);
    return res.status(403).json({ message: 'Authentication failed: Token verification error' });
  }
}; 