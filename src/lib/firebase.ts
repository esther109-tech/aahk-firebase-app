import { initializeApp, getApps, getApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";
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
const db = getFirestore(app, "aahk-firestore");
const auth = getAuth(app);

export { app, storage, db, auth };
