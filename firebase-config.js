// Firebase Configuration
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyA-GvFzuzj-S4xtDjsKgMe3kf2yD6GEikc",
    authDomain: "zero-ec5ea.firebaseapp.com",
    projectId: "zero-ec5ea",
    storageBucket: "zero-ec5ea.firebasestorage.app",
    messagingSenderId: "752169579365",
    appId: "1:752169579365:web:9eb1d14aa4019ae9d3e78c",
    measurementId: "G-T2SLC1SKK8"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
