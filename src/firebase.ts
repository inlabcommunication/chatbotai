import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const isFirebaseConfigured = () => !!firebaseConfig.apiKey && !!firebaseConfig.projectId;

const app = isFirebaseConfigured() && !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = isFirebaseConfigured() ? getAuth(app) : null;
export const db = isFirebaseConfigured() ? getFirestore(app) : null;
