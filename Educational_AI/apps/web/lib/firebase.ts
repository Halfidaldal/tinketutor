'use client';

import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, onAuthStateChanged } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

export const REQUIRED_FIREBASE_PUBLIC_ENV = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
] as const;

type RequiredFirebasePublicEnvKey = (typeof REQUIRED_FIREBASE_PUBLIC_ENV)[number];

const firebasePublicEnv: Record<RequiredFirebasePublicEnvKey, string | undefined> = {
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getRequiredFirebaseEnv(key: RequiredFirebasePublicEnvKey): string {
  const value = firebasePublicEnv[key]?.trim();
  if (!value) {
    throw new Error(
      `Missing required public Firebase env var ${key}. ` +
        'Configure the frontend env contract before loading the web app.',
    );
  }
  return value;
}

const firebaseConfig = {
  apiKey: getRequiredFirebaseEnv('NEXT_PUBLIC_FIREBASE_API_KEY'),
  authDomain: getRequiredFirebaseEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  projectId: getRequiredFirebaseEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
  storageBucket: getRequiredFirebaseEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getRequiredFirebaseEnv('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getRequiredFirebaseEnv('NEXT_PUBLIC_FIREBASE_APP_ID'),
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const firestore = getFirestore(app);
export const storage = getStorage(app);

const useEmulators = process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === 'true';
const firebaseState = globalThis as typeof globalThis & {
  __synthesisEmulatorsConnected?: boolean;
  __synthesisAuthReadyPromise?: Promise<void> | null;
};

function connectEmulatorsIfNeeded() {
  if (typeof window === 'undefined' || !useEmulators || firebaseState.__synthesisEmulatorsConnected) {
    return;
  }

  connectAuthEmulator(
    auth,
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL || 'http://127.0.0.1:9099',
    { disableWarnings: true },
  );

  connectFirestoreEmulator(
    firestore,
    process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_HOST || '127.0.0.1',
    Number(process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_PORT || '8080'),
  );

  connectStorageEmulator(
    storage,
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1',
    Number(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_PORT || '9199'),
  );

  firebaseState.__synthesisEmulatorsConnected = true;
}

connectEmulatorsIfNeeded();

export function waitForAuthReady(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  connectEmulatorsIfNeeded();

  if (!firebaseState.__synthesisAuthReadyPromise) {
    firebaseState.__synthesisAuthReadyPromise = new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(
        auth,
        () => {
          unsubscribe();
          resolve();
        },
        () => {
          unsubscribe();
          resolve();
        },
      );
    });
  }

  return firebaseState.__synthesisAuthReadyPromise;
}

export async function getCurrentIdToken(forceRefresh = false): Promise<string | null> {
  await waitForAuthReady();
  if (!auth.currentUser) {
    return null;
  }
  return auth.currentUser.getIdToken(forceRefresh);
}

export default app;
