import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDIRWSEgxGgJVTLC3KuZqyZQNjAyO3o2L0",
  authDomain: "movie-analysis-d05fb.firebaseapp.com",
  projectId: "movie-analysis-d05fb",
  storageBucket: "movie-analysis-d05fb.firebasestorage.app",
  messagingSenderId: "418581053249",
  appId: "1:418581053249:web:eed1aee38ce9d683a2abc0",
  measurementId: "G-YSBMCREM4F",
};

export const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
