import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { getDatabase, ref, push, set, get, child, update } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBTS8ymB6THZZNs4Bka-xx5W8kQ5oUR6NI",
  authDomain: "betting-at-developers-smc.firebaseapp.com",
  databaseURL: "https://betting-at-developers-smc-default-rtdb.firebaseio.com",
  projectId: "betting-at-developers-smc",
  storageBucket: "betting-at-developers-smc.firebasestorage.app",
  messagingSenderId: "1086266960540",
  appId: "1:1086266960540:web:688378cae5d7f170c45b59",
  measurementId: "G-QNQN61GB9V",
};

const app = initializeApp(firebaseConfig);
try { getAnalytics(app); } catch (e) { /* analytics may fail in some envs */ }

export const auth = getAuth(app);
export const db = getDatabase(app);

export const firebaseAuth = {
  signInWithEmail: (email: string, password: string) =>
    signInWithEmailAndPassword(auth, email, password),
  createUserWithEmail: (email: string, password: string) =>
    createUserWithEmailAndPassword(auth, email, password),
  signOut: () => signOut(auth),
  onAuthStateChanged,
};

export const firebaseDb = {
  ref,
  push,
  set,
  get,
  child,
  update,
};

export default app;
