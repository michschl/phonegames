import { describe, expect, it } from 'vitest';
import { daysUntil, examLabel } from './topics.ts';

describe('day of the test', () => {
  const NOW = new Date(2026, 10, 22, 18).getTime();
  it('counts whole days, also over a change of the month', () => {
    expect(daysUntil('2026-11-22', NOW)).toBe(0);
    expect(daysUntil('2026-11-23', NOW)).toBe(1);
    expect(daysUntil('2026-12-01', NOW)).toBe(9);
    expect(daysUntil('2026-11-20', NOW)).toBe(-2);
    expect(daysUntil(null, NOW)).toBeNull();
    expect(daysUntil('bald', NOW)).toBeNull();
  });
  it('says when the test is – nothing once it is over', () => {
    expect(examLabel('2026-11-22', NOW)).toBe('Prüfung heute');
    expect(examLabel('2026-11-23', NOW)).toBe('Prüfung morgen');
    expect(examLabel('2026-11-27', NOW)).toBe('Prüfung in 5 Tagen');
    expect(examLabel('2026-11-21', NOW)).toBeNull();
  });
});
