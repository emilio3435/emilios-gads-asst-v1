import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { authenticateToken } from './middleware/auth'; // Import the auth middleware

// Verify GOOGLE_CLIENT_ID is loaded after dotenv.config()
if (!process.env.GOOGLE_CLIENT_ID) {
  console.error('FATAL ERROR: GOOGLE_CLIENT_ID environment variable is not set after loading .env.');
  process.exit(1);
}

const app = express();
const port = process.env.PORT || 3001; // Use environment variable or default

// Middleware
app.use(cors()); // Enable CORS for all origins (adjust for production)
app.use(express.json()); // Parse JSON request bodies

// Simple Root Route
app.get('/', (req: Request, res: Response) => {
  res.send('Audacy Assistant Backend is running!');
});

// --- History API Routes (Protected by Auth Middleware) ---

// GET /api/history - Fetch history for the user
app.get('/api/history', authenticateToken, (req: Request, res: Response) => {
  console.log(`Received GET /api/history request for user: ${req.user?.email}`);
  // TODO: Add fetch logic using req.user.sub or req.user.email
  const userId = req.user?.sub; // Google User ID (subject)
  res.status(200).json({ message: `GET /api/history endpoint reached for user ${userId}`, data: [] });
});

// POST /api/history - Save a new history entry
app.post('/api/history', authenticateToken, (req: Request, res: Response) => {
  console.log(`Received POST /api/history request for user: ${req.user?.email}`);
  console.log('Request body:', req.body);
  // TODO: Add save logic using req.user.sub or req.user.email
  const userId = req.user?.sub;
  res.status(201).json({ message: `POST /api/history endpoint reached for user ${userId}`, entry: req.body });
});

// DELETE /api/history - Clear history for the user
app.delete('/api/history', authenticateToken, (req: Request, res: Response) => {
  console.log(`Received DELETE /api/history request for user: ${req.user?.email}`);
  // TODO: Add delete logic using req.user.sub or req.user.email
  const userId = req.user?.sub;
  res.status(200).json({ message: `DELETE /api/history endpoint reached for user ${userId}` });
});

// --- End History API Routes ---

// Global Error Handler (Example)
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Start Server
app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
}); 