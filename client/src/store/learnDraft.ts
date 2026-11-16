import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LearnDraft, LearnStack } from '../../../shared/types.ts';
import { createId } from '../lib/util.ts';

/** A card while it is being reviewed or edited. */
export interface EditorCard {
  /** Stable React key. */
  key: string;
  /** Id of the saved card (existing stacks). */
  id?: string;
  kind: LearnStack['cards'][number]['kind'];
  prompt: string;
  answer: string;
  accepted: string[];
  distractors: string[];
  /** Why the card needs a second look, or empty. */
  uncertain: string;
  /** Answer as it came in – alternative and wrong answers are only kept while it stays the same. */
  originalAnswer: string;
}

export interface EditorValue {
  title: string;
  subject: string;
  languages: string[];
  cards: EditorCard[];
  suggestedModes: LearnStack['suggestedModes'];
  source: LearnStack['source'];
  removedPersonalData?: boolean;
  /** The AI invented the cards on the topic of the photos. */
  generated?: boolean;
}

export function emptyCard(): EditorCard {
  return { key: createId(), kind: 'qa', prompt: '', answer: '', accepted: [], distractors: [], uncertain: '', originalAnswer: '' };
}

export function fromDraft(draft: LearnDraft, source: LearnStack['source']): EditorValue {
  return {
    title: draft.title,
    subject: draft.subject,
    languages: draft.languages,
    suggestedModes: draft.suggestedModes,
    source,
    removedPersonalData: draft.removedPersonalData,
    generated: draft.generated,
    cards: draft.cards.map((card) => ({ ...card, key: createId(), originalAnswer: card.answer })),
  };
}

export function fromStack(stack: LearnStack): EditorValue {
  return {
    title: stack.title,
    subject: stack.subject,
    languages: stack.languages,
    suggestedModes: stack.suggestedModes,
    source: stack.source,
    cards: stack.cards.map((card) => ({ ...card, key: card.id, uncertain: '', originalAnswer: card.answer })),
  };
}

interface DraftState {
  /** Unsaved result of a photo analysis – kept so a paid analysis is never lost by leaving the page. */
  draft: (EditorValue & { ownerId: string }) | null;
  setDraft(draft: (EditorValue & { ownerId: string }) | null): void;
}

export const useLearnDraft = create<DraftState>()(
  persist((set) => ({ draft: null, setDraft: (draft) => set({ draft }) }), { name: 'phonegames-learn-draft', version: 1 }),
);
