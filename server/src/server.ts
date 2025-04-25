import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

// Initialize Firebase Admin SDK first
import { db } from './firebase'; // Import the initialized Firestore instance
import * as admin from 'firebase-admin'; // Import Firebase Admin types

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { authenticateToken } from './middleware/auth'; // Import the auth middleware
import { ServiceAccount } from 'firebase-admin';
import { OAuth2Client } from 'google-auth-library';

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
app.use(express.json({ limit: '50mb' })); // Parse JSON request bodies
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

// GET /api/history/:id - Fetch a specific history entry by ID
app.get('/api/history/:id', authenticateToken, async (req: Request, res: Response) => {
  console.log(`Received GET /api/history/:id request for entry ID: ${req.params.id} from user: ${req.user?.email}`);
  const userId = req.user?.sub;
  const entryId = req.params.id;

  if (!userId) {
    return res.status(400).json({ message: 'User ID not found after authentication.' });
  }

  if (!entryId) {
    return res.status(400).json({ message: 'History entry ID is required.' });
  }

  try {
    console.log(`Looking up document with ID: ${entryId} in collection 'userHistory'`);
    // Get the document
    const docRef = db.collection('userHistory').doc(entryId);
    const doc = await docRef.get();

    if (!doc.exists) {
      console.log(`GET ERROR: History entry ${entryId} not found. Doc doesn't exist.`);
      return res.status(404).json({ message: 'This history entry is no longer available. It may have been deleted.' });
    }

    const data = doc.data();
    
    // Verify the entry belongs to the authenticated user
    if (data?.userId !== userId) {
      console.log(`GET ERROR: Unauthorized attempt to access history entry ${entryId} by user ${userId}.`);
      return res.status(403).json({ message: 'Unauthorized. You can only access your own history entries.' });
    }

    // Return the entry data with its ID
    const historyEntry = {
      id: doc.id,
      ...data
    };
    
    console.log(`Successfully fetched history entry ${entryId} for user ${userId}.`);
    res.status(200).json({ message: 'History entry fetched successfully.', data: historyEntry });

  } catch (error) {
    console.error(`GET ERROR: Error fetching history entry ${entryId} for user ${userId}:`, error);
    res.status(500).json({ message: 'Failed to fetch history entry due to a server error.' });
  }
});

// POST /api/history - Save a new history entry
app.post('/api/history', authenticateToken, async (req: Request, res: Response) => {
  console.log(`Received POST /api/history request for user: ${req.user?.email}`);
  console.log(`POST request body size: ${JSON.stringify(req.body).length} bytes`);
  
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

    console.log(`Data being saved to Firestore for user ${userId}:`, dataToSave);

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

// POST /api/history/:id/chat - Add a chat message to an existing history entry
app.post('/api/history/:id/chat', authenticateToken, async (req: Request, res: Response) => {
  console.log(`Received POST /api/history/:id/chat request for entry ID: ${req.params.id} from user: ${req.user?.email}`);
  const userId = req.user?.sub;
  const entryId = req.params.id;
  const messageData = req.body;

  if (!userId) {
    return res.status(400).json({ message: 'User ID not found after authentication.' });
  }

  if (!entryId) {
    return res.status(400).json({ message: 'History entry ID is required.' });
  }

  if (!messageData || !messageData.type || !messageData.content) {
    return res.status(400).json({ message: 'Message data must include type and content.' });
  }

  try {
    const docRef = db.collection('userHistory').doc(entryId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ message: 'History entry not found.' });
    }

    const data = doc.data();
    
    if (data?.userId !== userId) {
      return res.status(403).json({ message: 'Unauthorized. You can only update your own history entries.' });
    }

    // Create a new message with a timestamp
    const newMessage = {
      type: messageData.type,
      content: messageData.content,
      timestamp: new Date()
    };

    // Update the document to append the new message to the helpConversation array
    await docRef.update({
      'results.helpConversation': admin.firestore.FieldValue.arrayUnion(newMessage)
    });
    
    console.log(`Successfully added chat message to history entry ${entryId} for user ${userId}.`);
    res.status(200).json({ 
      message: 'Chat message added successfully.',
      entryId: entryId,
      chatMessage: newMessage
    });

  } catch (error) {
    console.error(`Error adding chat message to history entry ${entryId} for user ${userId}:`, error);
    res.status(500).json({ message: 'Failed to add chat message due to a server error.' });
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

// DELETE /api/history/:id - Delete a specific history entry
app.delete('/api/history/:id', authenticateToken, async (req: Request, res: Response) => {
  console.log(`Received DELETE /api/history/:id request for entry ID: ${req.params.id} from user: ${req.user?.email}`);
  const userId = req.user?.sub;
  const entryId = req.params.id;

  if (!userId) {
    console.log('DELETE ERROR: User ID not found after authentication');
    return res.status(400).json({ message: 'User ID not found after authentication.' });
  }

  if (!entryId) {
    console.log('DELETE ERROR: History entry ID is required');
    return res.status(400).json({ message: 'History entry ID is required.' });
  }

  try {
    console.log(`Looking up document with ID: ${entryId} in collection 'userHistory'`);
    // Get the document to verify ownership
    const docRef = db.collection('userHistory').doc(entryId);
    const doc = await docRef.get();

    if (!doc.exists) {
      console.log(`DELETE ERROR: History entry ${entryId} not found. Doc doesn't exist.`);
      return res.status(404).json({ message: 'History entry not found.' });
    }

    const data = doc.data();
    console.log(`Found entry with ID ${entryId}, data:`, data);
    
    // Verify the entry belongs to the authenticated user
    if (data?.userId !== userId) {
      console.log(`DELETE ERROR: Unauthorized attempt to delete history entry ${entryId} by user ${userId}.`);
      console.log(`Entry belongs to user ${data?.userId}`);
      return res.status(403).json({ message: 'Unauthorized. You can only delete your own history entries.' });
    }

    // Delete the document
    await docRef.delete();
    
    console.log(`Successfully deleted history entry ${entryId} for user ${userId}.`);
    res.status(200).json({ message: 'History entry deleted successfully.' });

  } catch (error) {
    console.error(`DELETE ERROR: Error deleting history entry ${entryId} for user ${userId}:`, error);
    res.status(500).json({ message: 'Failed to delete history entry due to a server error.' });
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