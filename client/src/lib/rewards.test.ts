import { describe, expect, it } from 'vitest';
import { codeMatches, hashCode, isOpen, validCode } from './rewards.ts';

describe('code of «Belohnungen»', () => {
  it('hashes the same way on every device and checks the code', () => {
    expect(hashCode('1234', 'salt')).toBe(hashCode('1234', 'salt'));
    expect(hashCode('1234', 'salt')).not.toBe(hashCode('1235', 'salt'));
    expect(hashCode('1234', 'salt')).not.toBe(hashCode('1234', 'other'));
    const rewards = { codeHash: hashCode('2468', 'abc'), codeSalt: 'abc' };
    expect(codeMatches(rewards, '2468')).toBe(true);
    expect(codeMatches(rewards, ' 2468 ')).toBe(true);
    expect(codeMatches(rewards, '1111')).toBe(false);
    expect(codeMatches({ codeHash: '', codeSalt: '' }, '')).toBe(false);
  });

  it('accepts 4 to 8 digits and stays open for a while', () => {
    expect(validCode('123')).toBe(false);
    expect(validCode('1234')).toBe(true);
    expect(validCode('12a4')).toBe(false);
    expect(isOpen({ codeHash: '' }, 0)).toBe(true);
    expect(isOpen({ codeHash: 'x' }, 0, 10)).toBe(false);
    expect(isOpen({ codeHash: 'x' }, 20, 10)).toBe(true);
  });
});
