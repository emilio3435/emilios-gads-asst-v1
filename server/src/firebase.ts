import * as admin from 'firebase-admin';
import path from 'path';

// Determine the correct path to the service account key file
// __dirname refers to the directory of the current module (dist/ when compiled)
// The service root on Render is 'server', and the secret file is placed there.
// When running 'node dist/server.js' from 'server', __dirname is 'server/dist'.
// So, the key file is one level up from __dirname.
const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account-key.json');

try {
  // Initialize Firebase Admin SDK
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath),
    // Add your databaseURL if needed, though often inferred
    // databaseURL: "https://<YOUR_PROJECT_ID>.firebaseio.com" 
  });

  console.log('Firebase Admin SDK initialized successfully.');

} catch (error: any) {
  console.error('Firebase Admin SDK initialization failed:', error.message);
  console.error('Ensure the service account key file exists at:', serviceAccountPath);
  console.error('Or check Render Secret File path if deployed.');
  process.exit(1); // Exit if Firebase initialization fails
}

// Get Firestore instance
const db = admin.firestore();

// Export Firestore database instance for use in other modules
export { db }; 