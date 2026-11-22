import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/*
 * A document being solved in the app: who solves it, the answers so far and where they are – kept on
 * the device, so leaving the page (or a reload) loses nothing. Notes on the «Notizblatt» stay in memory.
 */

export interface SolveSession {
  ownerId: string;
  learner: string;
  startedAt: number;
  /** Task being shown. */
  index: number;
  /** Task id → answer (text, the chosen option, «richtig»/«falsch»). */
  answers: Record<string, string>;
  /** Handed in: the app shows the solutions and asks for the points of open tasks. */
  submitted: boolean;
  /** Task id → points given by the person for an open task. */
  own: Record<string, number>;
}

interface SolveState {
  sessions: Record<string, SolveSession>;
  start(docId: string, ownerId: string, learner: string): void;
  update(docId: string, patch: Partial<SolveSession>): void;
  end(docId: string): void;
}

export const useSolve = create<SolveState>()(
  persist(
    (set) => ({
      sessions: {},
      start: (docId, ownerId, learner) =>
        set((s) => ({
          sessions: { ...s.sessions, [docId]: { ownerId, learner, startedAt: Date.now(), index: 0, answers: {}, submitted: false, own: {} } },
        })),
      update: (docId, patch) =>
        set((s) => {
          const session = s.sessions[docId];
          return session ? { sessions: { ...s.sessions, [docId]: { ...session, ...patch } } } : s;
        }),
      end: (docId) =>
        set((s) => {
          const sessions = { ...s.sessions };
          delete sessions[docId];
          return { sessions };
        }),
    }),
    { name: 'phonegames-solve', version: 1 },
  ),
);
