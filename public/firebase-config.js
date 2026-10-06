// Single source of truth for Firebase. Every page imports { app, auth, db } from here.
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyATQU2_8h29Ki8rF-AaPb3cQ7RyD3HLLCw",
    authDomain: "pesatrack-92632.firebaseapp.com",
    databaseURL: "https://pesatrack-92632-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "pesatrack-92632",
    storageBucket: "pesatrack-92632.firebasestorage.app",
    messagingSenderId: "227171165751",
    appId: "1:227171165751:web:255aea2c6618dfdce981b2",
    measurementId: "G-SL0RL58835"
};

export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Offline cache: the app keeps working without internet and syncs when back online.
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
