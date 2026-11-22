import { useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DocAttempt, TaskDocRequest, TaskDocument } from '../../../shared/types.ts';
import { LIMITS } from '../../../shared/types.ts';
import { api, ApiError } from '../lib/api.ts';
import { useAuth } from './auth.ts';

/*
 * Documents of «Aufgaben» (tests, task sheets, practice exams). The server keeps them – they are
 * written there by the AI and can be large – and the app keeps a copy of each one it has seen, so a
 * document can be read and printed offline too.
 */

interface DocumentsState {
  /** Account the copies belong to. */
  ownerId: string | null;
  docs: Record<string, TaskDocument>;
  /** Document ids per topic, newest first – as the server listed them last. */
  byTopic: Record<string, string[]>;
  /** Results saved without internet – sent as soon as the server can be reached. */
  outbox: { docId: string; attempt: DocAttempt }[];
  put(doc: TaskDocument): void;
  putTopic(topicId: string, docs: TaskDocument[]): void;
  drop(id: string): void;
}

/** A document as the server sent it, plus the results of it still waiting in the outbox. */
function withQueued(doc: TaskDocument, outbox: DocumentsState['outbox']): TaskDocument {
  const queued = outbox.filter((item) => item.docId === doc.id && !doc.attempts.some((a) => a.id === item.attempt.id));
  return queued.length === 0 ? doc : { ...doc, attempts: queued.reduce((list, item) => withAttempt(list, item.attempt), doc.attempts) };
}

export const useDocuments = create<DocumentsState>()(
  persist(
    (set) => ({
      ownerId: null,
      docs: {},
      byTopic: {},
      outbox: [],
      put: (incoming) =>
        set((s) => {
          const ids = s.byTopic[incoming.topicId] ?? [];
          const doc = withQueued(incoming, s.outbox);
          return {
            docs: { ...s.docs, [doc.id]: doc },
            byTopic: { ...s.byTopic, [doc.topicId]: ids.includes(doc.id) ? ids : [doc.id, ...ids] },
          };
        }),
      putTopic: (topicId, docs) =>
        set((s) => {
          const next = { ...s.docs };
          // Documents deleted on another device disappear here too.
          for (const id of s.byTopic[topicId] ?? []) if (!docs.some((d) => d.id === id)) delete next[id];
          for (const doc of docs) next[doc.id] = withQueued(doc, s.outbox);
          return { docs: next, byTopic: { ...s.byTopic, [topicId]: docs.map((d) => d.id) } };
        }),
      drop: (id) =>
        set((s) => {
          const doc = s.docs[id];
          const docs = { ...s.docs };
          delete docs[id];
          return {
            docs,
            byTopic: doc ? { ...s.byTopic, [doc.topicId]: (s.byTopic[doc.topicId] ?? []).filter((x) => x !== id) } : s.byTopic,
          };
        }),
    }),
    { name: 'phonegames-documents', version: 2, migrate: (state) => ({ outbox: [], ...(state as object) }) as unknown as DocumentsState },
  ),
);

/** Forgets every stored document (signing out, deleting the account). */
export function clearDocuments(): void {
  useDocuments.setState({ ownerId: null, docs: {}, byTopic: {}, outbox: [] });
}

/** Copies of another account are dropped (signing in with someone else on the same phone). */
function ensureOwner(): void {
  const userId = useAuth.getState().user?.id ?? null;
  if (useDocuments.getState().ownerId !== userId) useDocuments.setState({ ownerId: userId, docs: {}, byTopic: {}, outbox: [] });
}

export async function loadDocuments(topicId: string): Promise<void> {
  ensureOwner();
  const { documents } = await api.documents(topicId);
  useDocuments.getState().putTopic(topicId, documents);
}

export async function loadDocument(id: string): Promise<TaskDocument | null> {
  ensureOwner();
  try {
    const { document } = await api.document(id);
    useDocuments.getState().put(document);
    return document;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) useDocuments.getState().drop(id);
    throw error;
  }
}

export async function createDocument(request: TaskDocRequest): Promise<TaskDocument> {
  ensureOwner();
  const { document } = await api.createDocument(request);
  useDocuments.getState().put(document);
  return document;
}

export async function deleteDocument(id: string): Promise<void> {
  await api.deleteDocument(id);
  useDocuments.getState().drop(id);
}

/** A newer result with the same id replaces the old one; the latest 20 are kept – as on the server. */
function withAttempt(attempts: DocAttempt[], attempt: DocAttempt): DocAttempt[] {
  return [...attempts.filter((a) => a.id !== attempt.id), attempt].sort((a, b) => a.at - b.at).slice(-LIMITS.attemptsPerDocument);
}

/**
 * Saves a result. It counts at once on this device; without internet it waits in the outbox and is
 * sent later (see flushAttempts).
 */
export async function saveAttempt(docId: string, attempt: DocAttempt): Promise<'saved' | 'queued'> {
  const state = useDocuments.getState();
  const doc = state.docs[docId];
  if (doc) state.put({ ...doc, attempts: withAttempt(doc.attempts, attempt) });
  try {
    const { document } = await api.saveAttempt(docId, attempt);
    useDocuments.getState().put(document);
    return 'saved';
  } catch (error) {
    if (error instanceof ApiError) throw error;
    useDocuments.setState((s) => ({ outbox: [...s.outbox.filter((item) => item.attempt.id !== attempt.id), { docId, attempt }] }));
    return 'queued';
  }
}

export async function deleteAttempt(docId: string, attemptId: string): Promise<void> {
  const { document } = await api.deleteAttempt(docId, attemptId);
  useDocuments.setState((s) => ({ outbox: s.outbox.filter((item) => item.attempt.id !== attemptId) }));
  useDocuments.getState().put(document);
}

/** Sends the results saved without internet. A result the server refuses (document deleted) is dropped. */
export async function flushAttempts(): Promise<void> {
  ensureOwner();
  for (const item of useDocuments.getState().outbox) {
    try {
      const { document } = await api.saveAttempt(item.docId, item.attempt);
      useDocuments.getState().put(document);
    } catch (error) {
      if (!(error instanceof ApiError)) return; // still offline
    }
    useDocuments.setState((s) => ({ outbox: s.outbox.filter((x) => x.attempt.id !== item.attempt.id) }));
  }
}

/** The documents of a topic (copies), newest first. */
export function useTopicDocuments(topicId: string | undefined): TaskDocument[] {
  const docs = useDocuments((s) => s.docs);
  const ids = useDocuments((s) => (topicId ? s.byTopic[topicId] : undefined));
  return (ids ?? []).map((id) => docs[id]).filter((d): d is TaskDocument => !!d);
}

/** While a document is being written: ask the server every few seconds. */
export function usePollPending(docs: TaskDocument[]): void {
  const pending = docs.filter((d) => d.status === 'pending').map((d) => d.id).join(',');
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => {
      for (const id of pending.split(',')) void loadDocument(id).catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [pending]);
}
