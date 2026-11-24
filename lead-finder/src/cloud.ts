import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, setDoc, doc, deleteDoc } from 'firebase/firestore';
import type { Lead } from './model';

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};
export const cloudConfigured = !!(cfg.apiKey && cfg.projectId && cfg.appId);
const app = cloudConfigured ? initializeApp(cfg) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

const docId = (id: string) => id.replace(/[/\s]/g, '_');
/** Firestore non accetta `undefined`. */
const clean = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

export const cloud = {
  onUser: (cb: (u: User | null) => void) => (auth ? onAuthStateChanged(auth, cb) : (cb(null), () => {})),
  login: (email: string, password: string) => signInWithEmailAndPassword(auth!, email, password),
  logout: () => (auth ? signOut(auth) : Promise.resolve()),
  watch: (cb: (leads: Lead[]) => void, onErr: (e: Error) => void) => onSnapshot(collection(db!, 'leads'), (s) => cb(s.docs.map((d) => d.data() as Lead)), onErr),
  save: (l: Lead) => setDoc(doc(db!, 'leads', docId(l.id)), clean(l)),
  remove: (id: string) => deleteDoc(doc(db!, 'leads', docId(id))),
};
