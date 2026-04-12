'use client';

/**
 * useTutorSessionController — Phase 2 shared tutor session hook.
 *
 * Extracted so the Study Home shell (`TutorShellPanel`) and the workspace
 * split-pane (`TutorPanel`) can attach to the same bootstrap, send queries,
 * and escalate without reimplementing the flow twice. Every mutation preserves
 * the tutor's grounding guarantees — locale split (`uiLocale` / `responseLocale`)
 * is forwarded to every API call per v2 language spec §1/§7.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../api';
import type { Locale } from '../i18n';
import type { TutorSession, TutorTurn } from '../tutor';

export type TutorEscalationAction = 'show_more_help' | 'give_me_the_answer' | 'explain_directly';

export interface UseTutorSessionControllerOptions {
  notebookId: string;
  uiLocale: Locale;
  responseLocale: Locale;
  initialSession?: TutorSession | null;
  initialTurns?: TutorTurn[];
  /** When true, the hook calls `bootstrapSession` on mount so the Study Home shell
   *  always has an onboarding turn without requiring the user to type first. */
  autoBootstrap?: boolean;
  /** Translator for fallback error messages. Keep callers free to localize. */
  translateError?: (key: 'loadSession' | 'request' | 'escalation') => string;
}

export interface UseTutorSessionControllerResult {
  session: TutorSession | null;
  turns: TutorTurn[];
  loading: boolean;
  submitting: boolean;
  error: string | null;
  latestTutorTurn: TutorTurn | null;
  bootstrap: () => Promise<void>;
  sendQuery: (
    query: string,
    opts?: { sourceIds?: string[]; focusArea?: string },
  ) => Promise<void>;
  escalate: (action: TutorEscalationAction) => Promise<void>;
  reset: () => void;
  loadSession: (sessionId: string) => Promise<void>;
  clearError: () => void;
  setError: (message: string | null) => void;
}

interface SessionEnvelope {
  session: TutorSession;
  turns?: TutorTurn[];
  turn?: TutorTurn;
}

const defaultTranslateError = (key: 'loadSession' | 'request' | 'escalation'): string => {
  switch (key) {
    case 'loadSession':
      return 'Failed to load tutor session';
    case 'escalation':
      return 'Escalation failed';
    case 'request':
    default:
      return 'Tutor request failed';
  }
};

export function useTutorSessionController(
  options: UseTutorSessionControllerOptions,
): UseTutorSessionControllerResult {
  const {
    notebookId,
    uiLocale,
    responseLocale,
    initialSession = null,
    initialTurns = [],
    autoBootstrap = false,
    translateError = defaultTranslateError,
  } = options;

  const [session, setSession] = useState<TutorSession | null>(initialSession);
  const [turns, setTurns] = useState<TutorTurn[]>(initialTurns);
  const [loading, setLoading] = useState<boolean>(!initialSession && autoBootstrap);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const cancelledRef = useRef(false);
  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const locales = useMemo(
    () => ({ uiLocale, responseLocale, locale: responseLocale }),
    [uiLocale, responseLocale],
  );

  const loadSession = useCallback(
    async (sessionId: string) => {
      const response = (await api.tutor.getSession(notebookId, sessionId)) as {
        session: TutorSession;
        turns: TutorTurn[];
      };
      if (cancelledRef.current) return;
      setSession(response.session);
      setTurns(response.turns);
    },
    [notebookId],
  );

  const applyEnvelope = useCallback((envelope: SessionEnvelope) => {
    setSession(envelope.session);
    if (envelope.turns) {
      setTurns(envelope.turns);
    } else if (envelope.turn) {
      setTurns((current) => {
        // Bootstrap returns a single turn. If it already exists (idempotent
        // re-call), don't append a duplicate.
        if (current.some((turn) => turn.id === envelope.turn!.id)) {
          return current;
        }
        return [...current, envelope.turn!];
      });
    }
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const envelope = (await api.tutor.bootstrapSession(notebookId, locales)) as {
        session: TutorSession;
        turn: TutorTurn;
      };
      if (cancelledRef.current) return;
      // Replace turn history with the bootstrap turn so refreshes don't
      // accumulate duplicate greetings in local state.
      setSession(envelope.session);
      setTurns([envelope.turn]);
    } catch (err) {
      if (cancelledRef.current) return;
      setError(err instanceof Error ? err.message : translateError('loadSession'));
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
      }
    }
  }, [notebookId, locales, translateError]);

  useEffect(() => {
    if (autoBootstrap && !initialSession) {
      bootstrap().catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebookId]);

  const sendQuery = useCallback(
    async (query: string, opts?: { sourceIds?: string[]; focusArea?: string }) => {
      const trimmed = query.trim();
      if (!trimmed) return;

      setSubmitting(true);
      setError(null);
      try {
        if (!session) {
          const envelope = (await api.tutor.startSession(notebookId, {
            query: trimmed,
            focusArea: opts?.focusArea,
            sourceIds: opts?.sourceIds,
            ...locales,
          })) as { session: TutorSession; turn: TutorTurn };
          if (cancelledRef.current) return;
          await loadSession(envelope.session.id);
        } else {
          await api.tutor.sendTurn(notebookId, session.id, trimmed, locales);
          if (cancelledRef.current) return;
          await loadSession(session.id);
        }
      } catch (err) {
        if (cancelledRef.current) return;
        setError(err instanceof Error ? err.message : translateError('request'));
      } finally {
        if (!cancelledRef.current) {
          setSubmitting(false);
        }
      }
    },
    [locales, loadSession, notebookId, session, translateError],
  );

  const escalate = useCallback(
    async (action: TutorEscalationAction) => {
      if (!session) return;
      setSubmitting(true);
      setError(null);
      try {
        await api.tutor.escalate(notebookId, session.id, { action, ...locales });
        if (cancelledRef.current) return;
        await loadSession(session.id);
      } catch (err) {
        if (cancelledRef.current) return;
        setError(err instanceof Error ? err.message : translateError('escalation'));
      } finally {
        if (!cancelledRef.current) {
          setSubmitting(false);
        }
      }
    },
    [locales, loadSession, notebookId, session, translateError],
  );

  const reset = useCallback(() => {
    setSession(null);
    setTurns([]);
    setError(null);
  }, []);

  const latestTutorTurn = useMemo(
    () => [...turns].reverse().find((turn) => turn.role === 'tutor') ?? null,
    [turns],
  );

  // Keep locales and envelope helper linted-available even when unused by caller.
  void applyEnvelope;

  return {
    session,
    turns,
    loading,
    submitting,
    error,
    latestTutorTurn,
    bootstrap,
    sendQuery,
    escalate,
    reset,
    loadSession,
    clearError,
    setError,
  };
}
