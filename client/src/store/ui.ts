import { create } from 'zustand';

export interface ToastItem {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
  action?: { label: string; onClick: () => void };
  duration: number;
}

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

interface UiState {
  toasts: ToastItem[];
  online: boolean;
  syncStatus: SyncStatus;
}

export const useUi = create<UiState>(() => ({
  toasts: [],
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncStatus: 'idle',
}));

let nextId = 1;

export function toast(
  message: string,
  options: { tone?: ToastItem['tone']; action?: ToastItem['action']; duration?: number } = {},
): number {
  const id = nextId++;
  const item: ToastItem = {
    id,
    message,
    tone: options.tone ?? 'info',
    action: options.action,
    duration: options.duration ?? 3800,
  };
  useUi.setState((s) => ({ toasts: [...s.toasts.slice(-2), item] }));
  window.setTimeout(() => dismissToast(id), item.duration);
  return id;
}

export function dismissToast(id: number): void {
  useUi.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}
