// Firebase initialization for the web app (project: umfaris-1efca).
// The web API key is public by design; access is gated by Firestore security rules.
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: 'AIzaSyAU6H9FZY0PR6-3JE3KGuwskKPbWbjwTew',
  authDomain: 'umfaris-1efca.firebaseapp.com',
  projectId: 'umfaris-1efca',
  storageBucket: 'umfaris-1efca.firebasestorage.app',
  messagingSenderId: '327085595909',
  appId: '1:327085595909:web:033cff7b56fbee5106ab6c',
  measurementId: 'G-5JXV3G44M8',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Resolves once Firebase has restored the persisted auth session (so /me works on reload).
let _ready;
export function authReady() {
  _ready ||= new Promise((resolve) => {
    const unsub = auth.onAuthStateChanged((u) => {
      unsub();
      resolve(u);
    });
  });
  return _ready;
}
