import * as admin from 'firebase-admin';
// Remove path import as it's no longer needed
// import path from 'path';

// Determine the correct path to the service account key file

// Old path
// const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account-key.json');

// New path (relative to current working directory, expected to be 'server')
// const serviceAccountPath = path.resolve(process.cwd(), 'firebase-service-account-key.json');

try {
  // Initialize Firebase Admin SDK
  // Call initializeApp without arguments to use GOOGLE_APPLICATION_CREDENTIALS env var
  admin.initializeApp();

  console.log('Firebase Admin SDK initialized successfully using default credentials.');

} catch (error: any) {
  console.error('Firebase Admin SDK initialization failed:', error.message);
  // Update error message to reflect reliance on env var
  console.error('Ensure GOOGLE_APPLICATION_CREDENTIALS environment variable is set correctly in Render.');
  process.exit(1); // Exit if Firebase initialization fails
}

// Get Firestore instance
const db = admin.firestore();

// Export Firestore database instance for use in other modules
export { db }; 