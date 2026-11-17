import type { LearnStack, Player, PlayerGroup } from '../../../shared/types.ts';
import { progressId } from '../lib/learn.ts';
import { useData } from './data.ts';
import { toast } from './ui.ts';

/*
 * Deleting with a way back: the object is gone right away, the notice offers
 * «Rückgängig» for a few seconds. Restoring writes a newer timestamp, so the
 * object also comes back on other devices after the next sync.
 */

const UNDO_MS = 6500;

function undoToast(message: string, undo: () => void, restored: string) {
  toast(message, {
    duration: UNDO_MS,
    action: {
      label: 'Rückgängig',
      onClick: () => {
        undo();
        toast(restored, { tone: 'success' });
      },
    },
  });
}

/** Deletes a stack together with everyone's progress. */
export function deleteStackWithUndo(stack: LearnStack) {
  const data = useData.getState();
  const progress = Object.values(data.progress).filter((entry) => entry.stackId === stack.id && !entry.deleted);
  data.deleteStack(stack.id);
  undoToast(`«${stack.title}» gelöscht.`, () => useData.getState().restoreStack(stack, progress), `«${stack.title}» ist wieder da.`);
}

export function deleteGroupWithUndo(group: PlayerGroup) {
  useData.getState().deleteGroup(group.id);
  undoToast(`«${group.name}» gelöscht.`, () => useData.getState().restoreGroup(group), `«${group.name}» ist wieder da.`);
}

export function removePlayerWithUndo(group: PlayerGroup, player: Player) {
  const index = group.players.findIndex((p) => p.id === player.id);
  useData.getState().removePlayer(group.id, player.id);
  undoToast(`${player.name} entfernt.`, () => useData.getState().restorePlayer(group.id, player, index), `${player.name} ist wieder dabei.`);
}

/**
 * Removes a person from «Wer lernt?» of a stack, on every device: the Kartenkasten for it is emptied and
 * the person is no longer offered there. A name added only for this stack goes altogether.
 */
export function removeLearnerWithUndo(stackId: string, name: string) {
  const data = useData.getState();
  const entry = data.progress[progressId(stackId, name)];
  const kept = entry && !entry.deleted && !entry.removed ? entry : null;
  data.removeLearner(stackId, name);
  undoToast(
    `${name} entfernt.`,
    () => {
      if (kept) useData.getState().restoreProgress(kept);
      else useData.getState().unhideLearner(stackId, name);
    },
    `${name} ist wieder dabei.`,
  );
}

/** Generic version for things that live in a component (e.g. a card while editing). */
export function withUndo(message: string, undo: () => void, restored = 'Wiederhergestellt.') {
  undoToast(message, undo, restored);
}
