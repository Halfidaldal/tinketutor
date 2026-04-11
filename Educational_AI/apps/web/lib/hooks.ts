'use client';

import {
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { usePathname, useRouter } from 'next/navigation';
import {
  createElement,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { auth } from './firebase';

type EmailAuthMode = 'signin' | 'signup';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  authenticateWithEmail: (email: string, password: string, mode?: EmailAuthMode) => Promise<void>;
  signOutUser: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mapAuthError(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return 'Authentication failed. Please try again.';
  }

  switch ((error as { code: string }).code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'The email or password is incorrect.';
    case 'auth/email-already-in-use':
      return 'An account already exists for this email.';
    case 'auth/popup-closed-by-user':
      return 'The Google sign-in window was closed before completion.';
    case 'auth/too-many-requests':
      return 'Too many attempts were made. Try again in a moment.';
    default:
      return 'Authentication failed. Please try again.';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(
      auth,
      (nextUser) => {
        setUser(nextUser);
        setLoading(false);
      },
      () => {
        setUser(null);
        setLoading(false);
        setError('Authentication status could not be loaded.');
      },
    );

    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    error,
    signInWithGoogle: async () => {
      setError(null);
      const provider = new GoogleAuthProvider();
      try {
        await signInWithPopup(auth, provider);
      } catch (authError) {
        setError(mapAuthError(authError));
        throw authError;
      }
    },
    authenticateWithEmail: async (email: string, password: string, mode: EmailAuthMode = 'signin') => {
      setError(null);
      try {
        if (mode === 'signup') {
          await createUserWithEmailAndPassword(auth, email, password);
          return;
        }

        await signInWithEmailAndPassword(auth, email, password);
      } catch (authError) {
        setError(mapAuthError(authError));
        throw authError;
      }
    },
    signOutUser: async () => {
      setError(null);
      await signOut(auth);
    },
    clearError: () => setError(null),
  }), [error, loading, user]);

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

export function useRequireAuth(redirectTo = '/login') {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      const target = pathname ? `${redirectTo}?next=${encodeURIComponent(pathname)}` : redirectTo;
      router.replace(target);
    }
  }, [loading, pathname, redirectTo, router, user]);

  return { user, loading, isAuthenticated: Boolean(user) };
}

export function useRedirectAuthenticated(redirectTo = '/dashboard') {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace(redirectTo);
    }
  }, [loading, redirectTo, router, user]);

  return { user, loading };
}
