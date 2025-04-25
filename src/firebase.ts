// Firebase client-side configuration
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCf3w8d0QiHYI14Jx4ZR_XLMsRRGCLgldo",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "emilio-s-ads-assistant.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "emilio-s-ads-assistant",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "emilio-s-ads-assistant.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "767785559382",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:767785559382:web:eb36d9f32e30c13f9e7f04"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db }; 