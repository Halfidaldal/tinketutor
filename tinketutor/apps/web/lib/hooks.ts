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
import { useI18n } from './i18n';

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

function mapAuthError(error: unknown, t: (key: string) => string): string {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return t('auth.errors.generic');
  }

  switch ((error as { code: string }).code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return t('auth.errors.invalidCredential');
    case 'auth/email-already-in-use':
      return t('auth.errors.emailInUse');
    case 'auth/popup-closed-by-user':
      return t('auth.errors.popupClosed');
    case 'auth/too-many-requests':
      return t('auth.errors.tooManyRequests');
    default:
      return t('auth.errors.generic');
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
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
        setError(t('auth.errors.statusLoad'));
      },
    );

    return unsubscribe;
  }, [t]);

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
        setError(mapAuthError(authError, t));
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
        setError(mapAuthError(authError, t));
        throw authError;
      }
    },
    signOutUser: async () => {
      setError(null);
      await signOut(auth);
    },
    clearError: () => setError(null),
  }), [error, loading, t, user]);

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

export function useRedirectAuthenticated(redirectTo = '/study') {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace(redirectTo);
    }
  }, [loading, redirectTo, router, user]);

  return { user, loading };
}
