import { describe, expect, it } from 'vitest';
import { newUserFields, parseUserDoc } from './profile.ts';

describe('parseUserDoc (untrusted users/{uid})', () => {
  it('reads coins, items, equipment, name and lastReward', () => {
    const snapshot = parseUserDoc({
      coins: 1200,
      owned: { theme_void: true },
      equipped: { theme: 'theme_void' },
      lastPurchase: 'theme_void',
      name: 'Ana',
      lastReward: { toMillis: () => 1_700_000_000_000 },
      xp: 0,
    });
    expect(snapshot).toEqual({
      inventory: { coins: 1200, owned: { theme_void: true }, equipped: { theme: 'theme_void' }, lastPurchase: 'theme_void' },
      name: 'Ana',
      lastReward: 1_700_000_000_000,
    });
  });

  it('repairs whatever is wrong instead of failing', () => {
    expect(parseUserDoc(undefined)).toEqual({
      inventory: { coins: 0, owned: {}, equipped: {}, lastPurchase: null },
      name: null,
      lastReward: null,
    });
    const snapshot = parseUserDoc({
      coins: -5,
      owned: { nope: true, cannon_twin: 'yes' },
      equipped: { theme: 'theme_void' }, // not owned
      name: 'x',
      lastReward: 'yesterday',
    });
    expect(snapshot.inventory).toEqual({ coins: 0, owned: {}, equipped: {}, lastPurchase: null });
    expect(snapshot.name).toBeNull();
    expect(snapshot.lastReward).toBeNull();
  });

  it('a freshly created document reads back as an empty account', () => {
    const snapshot = parseUserDoc(newUserFields('Piloto0001', { toMillis: () => 42 }));
    expect(snapshot).toEqual({
      inventory: { coins: 0, owned: {}, equipped: {}, lastPurchase: null },
      name: 'Piloto0001',
      lastReward: 42,
    });
  });
});
