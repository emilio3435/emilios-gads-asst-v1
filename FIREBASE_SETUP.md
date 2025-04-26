# Firebase Setup Guide

This guide will help you set up Firebase correctly for your application to ensure chat history works properly across devices.

## 1. Firebase Console Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select your existing project
3. Enable required services:
   - Authentication (for user login)
   - Firestore Database (for storing chat history)

## 2. Web App Configuration

1. In Firebase Console, go to Project Settings (gear icon)
2. Under "Your apps", click the web icon (</>) to add a web app
3. Register your app with a nickname (e.g., "Emilio's Assistant")
4. Copy the configuration object

## 3. Environment Variables Setup

Add the following to your `.env` file (which appears to be on `.cursorignore`):

```
# Firebase Web SDK Configuration (for client-side)
VITE_FIREBASE_API_KEY=your_firebase_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

## 4. Firebase Admin SDK Setup (for server)

1. In Firebase Console, go to Project Settings
2. Go to the "Service accounts" tab
3. Click "Generate new private key"
4. Save the JSON file securely

Then add to your `.env`:

```
# Option 1: Path to service account credentials JSON file
GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccountKey.json

# Option 2 (alternative): Direct JSON credentials
# FIREBASE_ADMIN_CREDENTIALS={"type":"service_account","project_id":"your-project-id",...}
```

## 5. Firebase Rules Configuration

Set up appropriate security rules for your Firestore database:

1. Go to Firestore Database in Firebase Console
2. Click on the "Rules" tab
3. Configure rules to allow authenticated users to read/write their own chat history:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/history/{documentId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 6. Verifying Setup

After configuration:

1. Restart your server with `npm run dev`
2. Check browser console for Firebase initialization success messages
3. Test the chat history functionality
4. Verify data is being saved to Firestore (check Firebase Console)

## Troubleshooting

- **404 errors**: Ensure your server routes are correctly handling Firebase authentication
- **Authentication errors**: Verify your Firebase credentials and environment variables
- **CORS issues**: Make sure your server is configured to handle CORS properly 