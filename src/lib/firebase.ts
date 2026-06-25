import { initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentSingleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyDb_ElYJY38bx35mZnOXbUzcHlLYkZjBmg",
  authDomain: "escueladebaile-app.firebaseapp.com",
  projectId: "escueladebaile-app",
  storageBucket: "escueladebaile-app.firebasestorage.app",
  messagingSenderId: "872896104919",
  appId: "1:872896104919:web:aff40eceee9ebd28342392"
};

if (!firebaseConfig.apiKey) {
  console.error("FIREBASE CONFIG MISSING: Environment variables are not set. If you deployed to Hostinger, make sure you configure the environment variables during the build step.");
}

const app = initializeApp(firebaseConfig);

// Initialize Firestore with settings to improve connectivity in restricted environments
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentSingleTabManager({})
  }),
  experimentalForceLongPolling: true,
});

export const storage = getStorage(app);
