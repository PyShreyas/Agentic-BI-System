// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCOI2rmkMID7w1WWoahm-WWoZjfF-q62AY",
  authDomain: "ma-bi-extenal-report-tracker.firebaseapp.com",
  projectId: "ma-bi-extenal-report-tracker",
  storageBucket: "ma-bi-extenal-report-tracker.firebasestorage.app",
  messagingSenderId: "380872353908",
  appId: "1:380872353908:web:b376c5efe729a7b5058921"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app)
