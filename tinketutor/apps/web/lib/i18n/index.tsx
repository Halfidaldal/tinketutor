'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

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
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, options?: TranslateOptions) => string;
  formatDate: (value: string, options?: Intl.DateTimeFormatOptions) => string;
  formatTime: (value: string, options?: Intl.DateTimeFormatOptions) => string;
}

const dictionaries: Record<Locale, MessageTree> = {
  da: daMessages as MessageTree,
  en: enMessages as MessageTree,
};

const I18nContext = createContext<I18nContextValue | null>(null);
const LOCALE_STORAGE_KEY = 'tinketutor.locale';

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

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    if (typeof window === 'undefined') {
      return 'da';
    }

    const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return storedLocale === 'en' ? 'en' : 'da';
  });

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    }
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const messages = dictionaries[locale];
    const fallbackMessages = dictionaries.en;

    return {
      locale,
      setLocale,
      t: (key, options) => {
        const template =
          readMessage(messages, key) ??
          readMessage(fallbackMessages, key) ??
          key;
        return interpolate(template, options?.values);
      },
      formatDate: (value, options) => {
        try {
          return new Intl.DateTimeFormat(locale, options ?? {
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
          return new Intl.DateTimeFormat(locale, options ?? {
            hour: '2-digit',
            minute: '2-digit',
          }).format(new Date(value));
        } catch {
          return value;
        }
      },
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}
