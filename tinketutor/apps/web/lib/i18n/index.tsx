'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import daMessages from './da.json';
import enMessages from './en.json';

export type Locale = 'da' | 'en';

interface MessageTree {
  [key: string]: MessageValue;
}

type MessageValue = string | MessageTree;

interface TranslateOptions {
  values?: Record<string, string | number>;
}

interface I18nContextValue {
  /** Legacy alias for `uiLocale`. Prefer `uiLocale` in new code. */
  locale: Locale;
  /** Locale driving `t()` lookups, the HTML lang attribute, and date/time formatting. */
  uiLocale: Locale;
  /**
   * Locale the tutor (and other generation surfaces) should respond in.
   * Defaults to `uiLocale` until the learner explicitly chooses a different
   * response language. Wired end-to-end in Phase 2; UI toggle lands in Phase 3.
   */
  responseLocale: Locale;
  /** Legacy alias for `setUiLocale`. */
  setLocale: (locale: Locale) => void;
  setUiLocale: (locale: Locale) => void;
  setResponseLocale: (locale: Locale) => void;
  t: (key: string, options?: TranslateOptions) => string;
  formatDate: (value: string, options?: Intl.DateTimeFormatOptions) => string;
  formatTime: (value: string, options?: Intl.DateTimeFormatOptions) => string;
}

const dictionaries: Record<Locale, MessageTree> = {
  da: daMessages as MessageTree,
  en: enMessages as MessageTree,
};

const I18nContext = createContext<I18nContextValue | null>(null);
const UI_LOCALE_STORAGE_KEY = 'tinketutor.locale';
const RESPONSE_LOCALE_STORAGE_KEY = 'tinketutor.responseLocale';

function readMessage(messages: MessageTree, key: string): string | undefined {
  const segments = key.split('.');
  let current: MessageValue | undefined = messages;

  for (const segment of segments) {
    if (!current || typeof current === 'string') {
      return undefined;
    }
    current = current[segment];
  }

  return typeof current === 'string' ? current : undefined;
}

function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, token: string) => {
    const value = values[token];
    return value === undefined ? `{${token}}` : String(value);
  });
}

function readStoredLocale(key: string): Locale | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.localStorage.getItem(key);
  if (raw === 'en' || raw === 'da') {
    return raw;
  }
  return null;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [uiLocale, setUiLocaleState] = useState<Locale>(
    () => readStoredLocale(UI_LOCALE_STORAGE_KEY) ?? 'da',
  );
  const [responseLocale, setResponseLocaleState] = useState<Locale>(
    () => readStoredLocale(RESPONSE_LOCALE_STORAGE_KEY) ?? readStoredLocale(UI_LOCALE_STORAGE_KEY) ?? 'da',
  );
  const [responseLocaleExplicit, setResponseLocaleExplicit] = useState<boolean>(
    () => readStoredLocale(RESPONSE_LOCALE_STORAGE_KEY) !== null,
  );

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = uiLocale;
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, uiLocale);
    }
  }, [uiLocale]);

  useEffect(() => {
    if (typeof window !== 'undefined' && responseLocaleExplicit) {
      window.localStorage.setItem(RESPONSE_LOCALE_STORAGE_KEY, responseLocale);
    }
  }, [responseLocale, responseLocaleExplicit]);

  const setUiLocale = useCallback((next: Locale) => {
    setUiLocaleState(next);
    // When the learner hasn't explicitly chosen a response language, keep the
    // tutor aligned with the UI. Once they override it, we stop following.
    setResponseLocaleState((current) => (responseLocaleExplicit ? current : next));
  }, [responseLocaleExplicit]);

  const setResponseLocale = useCallback((next: Locale) => {
    setResponseLocaleState(next);
    setResponseLocaleExplicit(true);
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const messages = dictionaries[uiLocale];
    const fallbackMessages = dictionaries.en;

    return {
      locale: uiLocale,
      uiLocale,
      responseLocale,
      setLocale: setUiLocale,
      setUiLocale,
      setResponseLocale,
      t: (key, options) => {
        const template =
          readMessage(messages, key) ??
          readMessage(fallbackMessages, key) ??
          key;
        return interpolate(template, options?.values);
      },
      formatDate: (value, options) => {
        try {
          return new Intl.DateTimeFormat(uiLocale, options ?? {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          }).format(new Date(value));
        } catch {
          return value;
        }
      },
      formatTime: (value, options) => {
        try {
          return new Intl.DateTimeFormat(uiLocale, options ?? {
            hour: '2-digit',
            minute: '2-digit',
          }).format(new Date(value));
        } catch {
          return value;
        }
      },
    };
  }, [uiLocale, responseLocale, setUiLocale, setResponseLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}
