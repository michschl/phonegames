import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LearnTopic, TopicDraft } from '../../../shared/types.ts';
import { createId } from '../lib/util.ts';
import type { TopicInput } from './data.ts';

/** A learning goal while it is being reviewed or edited. */
export interface EditorGoal {
  /** Stable React key. */
  key: string;
  /** Id of the saved goal (existing topics). */
  id?: string;
  text: string;
  content: string;
  /** Why the goal needs a second look, or empty. */
  uncertain: string;
}

export interface TopicEditorValue {
  title: string;
  subject: string;
  level: string;
  goals: EditorGoal[];
  notes: string;
  examDate: string | null;
  source: LearnTopic['source'];
  removedPersonalData?: boolean;
}

export function emptyGoal(): EditorGoal {
  return { key: createId(), text: '', content: '', uncertain: '' };
}

export function fromTopicDraft(draft: TopicDraft, extra: { notes: string; examDate: string | null; source: LearnTopic['source'] }): TopicEditorValue {
  return {
    title: draft.title,
    subject: draft.subject,
    level: draft.level,
    goals: draft.goals.map((goal) => ({ ...goal, key: createId() })),
    removedPersonalData: draft.removedPersonalData,
    ...extra,
  };
}

export function fromTopic(topic: LearnTopic): TopicEditorValue {
  return {
    title: topic.title,
    subject: topic.subject,
    level: topic.level,
    goals: topic.goals.map((goal) => ({ ...goal, key: goal.id, uncertain: '' })),
    notes: topic.notes,
    examDate: topic.examDate,
    source: topic.source,
  };
}

/** What gets saved – goals without text are left out. */
export function toTopicInput(value: TopicEditorValue): TopicInput {
  return {
    title: value.title,
    subject: value.subject,
    level: value.level,
    goals: value.goals
      .filter((goal) => goal.text.trim())
      .map((goal) => ({ ...(goal.id ? { id: goal.id } : {}), text: goal.text, content: goal.content })),
    notes: value.notes,
    examDate: value.examDate || null,
    source: value.source,
  };
}

interface TopicDraftState {
  /** Unsaved result of an analysis – kept so it is never lost by leaving the page. */
  draft: (TopicEditorValue & { ownerId: string }) | null;
  setDraft(draft: (TopicEditorValue & { ownerId: string }) | null): void;
}

export const useTopicDraft = create<TopicDraftState>()(
  persist((set) => ({ draft: null, setDraft: (draft) => set({ draft }) }), { name: 'phonegames-topic-draft', version: 1 }),
);
