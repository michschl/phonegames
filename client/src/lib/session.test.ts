import { describe, expect, it } from 'vitest';
import type { PublicUser } from '../../../shared/types.ts';
import { needsTerms } from './session.ts';

describe('consent to the terms', () => {
  const user = { termsAccepted: false } as PublicUser;

  it('is asked for only once the operator details are filled in', () => {
    expect(needsTerms(user, true)).toBe(true);
    expect(needsTerms(user, false)).toBe(false);
    expect(needsTerms({ ...user, termsAccepted: true }, true)).toBe(false);
    expect(needsTerms(null, true)).toBe(false);
  });
});
