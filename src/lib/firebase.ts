import { initializeApp, getApps, getApp } from "firebase/app";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyAaYbqcGRhVmDTkFre4AkpP_tYx-Ns7EP4",
    authDomain: "gcp-tw-sandbox.firebaseapp.com",
    projectId: "gcp-tw-sandbox",
    storageBucket: "gcp-tw-sandbox.firebasestorage.app",
    messagingSenderId: "593899410363",
    appId: "1:593899410363:web:04c4e52b861afcba5faa9e",
    measurementId: "G-8NKP1LR6GF"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const storage = getStorage(app);
const db = getFirestore(app);
const auth = getAuth(app);

// Connect to emulators only when NEXT_PUBLIC_USE_EMULATORS=true
if (process.env.NEXT_PUBLIC_USE_EMULATORS === "true") {
  const g = globalThis as any;
  if (!g._firebaseEmulatorsConnected) {
    try {
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
      connectStorageEmulator(storage, "127.0.0.1", 9199);
      g._firebaseEmulatorsConnected = true;
    } catch (err) {
      console.warn("Firebase emulators connection warning:", err);
    }
  }
}

export { app, storage, db, auth };

