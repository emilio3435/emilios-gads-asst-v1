import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

// Initialize Firebase Admin SDK first
import { db } from './firebase'; // Import the initialized Firestore instance
import * as admin from 'firebase-admin'; // Import Firebase Admin types

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { authenticateToken } from './middleware/auth'; // Import the auth middleware

// Verify GOOGLE_CLIENT_ID is loaded after dotenv.config()
// This check is now less critical here as firebase init would fail first
// if (!process.env.GOOGLE_CLIENT_ID) {
//   console.error('FATAL ERROR: GOOGLE_CLIENT_ID environment variable is not set after loading .env.');
//   process.exit(1);
// }

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
app.get('/api/history', authenticateToken, async (req: Request, res: Response) => {
  console.log(`Received GET /api/history request for user: ${req.user?.email}`);
  const userId = req.user?.sub; // Google User ID (subject)

  if (!userId) {
    return res.status(400).json({ message: 'User ID not found after authentication.' });
  }

  try {
    console.log(`Fetching history for user ${userId}...`);
    const historyQuery = db.collection('userHistory')
                           .where('userId', '==', userId) // Filter by the logged-in user
                           .orderBy('timestamp', 'desc'); // Order by timestamp, newest first

    const snapshot = await historyQuery.get();

    if (snapshot.empty) {
      console.log(`No history found for user ${userId}.`);
      return res.status(200).json({ message: 'No history found for user.', data: [] });
    }

    // Explicitly type 'doc' using Firestore types
    const userHistory = snapshot.docs.map((doc: admin.firestore.QueryDocumentSnapshot) => ({
      id: doc.id, // Include the Firestore document ID
      ...doc.data(), // Spread the rest of the document data
    }));

    console.log(`Successfully fetched ${userHistory.length} history entries for user ${userId}.`);
    res.status(200).json({ message: 'History fetched successfully.', data: userHistory });

  } catch (error) {
    console.error(`Error fetching history for user ${userId}:`, error);
    res.status(500).json({ message: 'Failed to fetch history due to a server error.' });
  }
});

// POST /api/history - Save a new history entry
app.post('/api/history', authenticateToken, async (req: Request, res: Response) => {
  console.log(`Received POST /api/history request for user: ${req.user?.email}`);
  
  const userId = req.user?.sub;
  const historyEntryData = req.body; // Get data from frontend

  if (!userId) {
    console.error('Error in POST /api/history: User ID missing after authentication.');
    return res.status(400).json({ message: 'User ID not found after authentication.' });
  }

  if (!historyEntryData || typeof historyEntryData !== 'object' || Object.keys(historyEntryData).length === 0) {
    console.error('Error in POST /api/history: Invalid or empty request body.');
    return res.status(400).json({ message: 'Invalid or missing history entry data in request body.' });
  }

  try {
    const dataToSave = {
      ...historyEntryData,
      userId: userId, 
      timestamp: historyEntryData.timestamp ? new Date(historyEntryData.timestamp) : new Date(), 
    };

    const docRef = await db.collection('userHistory').add(dataToSave);
    
    console.log(`History entry saved successfully for user ${userId} with ID: ${docRef.id}`);

    res.status(201).json({ 
        message: `History entry saved successfully for user ${userId}`,
        entryId: docRef.id,
    });

  } catch (error) {
    console.error(`Error saving history entry for user ${userId}:`, error);
    res.status(500).json({ message: 'Failed to save history entry due to a server error.' });
  }
});

// DELETE /api/history - Clear history for the user
app.delete('/api/history', authenticateToken, async (req: Request, res: Response) => {
  console.log(`Received DELETE /api/history request for user: ${req.user?.email}`);
  const userId = req.user?.sub;

  if (!userId) {
    return res.status(400).json({ message: 'User ID not found after authentication.' });
  }

  try {
    console.log(`Attempting to delete history for user ${userId}...`);
    const query = db.collection('userHistory').where('userId', '==', userId);
    const snapshot = await query.get();

    if (snapshot.empty) {
      console.log(`No history found to delete for user ${userId}.`);
      return res.status(200).json({ message: 'No history found to delete.' });
    }

    // Use a batched write to delete all documents efficiently
    const batch = db.batch();
    // Explicitly type 'doc' using Firestore types
    snapshot.docs.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    const deleteCount = snapshot.size;
    console.log(`Successfully deleted ${deleteCount} history entries for user ${userId}.`);
    res.status(200).json({ message: `Successfully deleted ${deleteCount} history entries.` });

  } catch (error) {
    console.error(`Error deleting history for user ${userId}:`, error);
    res.status(500).json({ message: 'Failed to delete history due to a server error.' });
  }
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