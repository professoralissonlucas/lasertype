import { describe, expect, it } from 'vitest';
import { memoryStore } from '../utils/storage.ts';
import { defaultSettings, loadSettings, parseSettings, saveSettings, SETTINGS_KEY, type Settings } from './settings.ts';

const custom: Settings = {
  language: 'en',
  sfxVolume: 0.25,
  reduceEffects: true,
  requireAccents: true,
  mode: 'timeAttack',
  difficulty: 'hard',
};

describe('defaultSettings', () => {
  it('starts in Portuguese, Survival, Normal, with sound on', () => {
    expect(defaultSettings()).toMatchObject({
      language: 'pt-BR',
      mode: 'survival',
      difficulty: 'normal',
      reduceEffects: false,
      requireAccents: false,
    });
    expect(defaultSettings().sfxVolume).toBeGreaterThan(0);
  });

  it('starts with reduced effects when the OS asks for less motion', () => {
    expect(defaultSettings(true).reduceEffects).toBe(true);
  });
});

describe('parseSettings', () => {
  it('accepts valid settings as they are', () => {
    expect(parseSettings(custom)).toEqual(custom);
  });

  it('falls back to defaults for garbage', () => {
    for (const raw of [null, undefined, 42, 'x', []]) expect(parseSettings(raw)).toEqual(defaultSettings());
  });

  it('repairs each invalid field on its own', () => {
    const parsed = parseSettings({ ...custom, language: 'fr', difficulty: 'insane', reduceEffects: 'yes' });
    expect(parsed).toEqual({ ...custom, language: 'pt-BR', difficulty: 'normal', reduceEffects: false });
  });

  it('clamps the volume and rejects non-numbers', () => {
    expect(parseSettings({ sfxVolume: 3 }).sfxVolume).toBe(1);
    expect(parseSettings({ sfxVolume: -1 }).sfxVolume).toBe(0);
    expect(parseSettings({ sfxVolume: Number.NaN }).sfxVolume).toBe(defaultSettings().sfxVolume);
    expect(parseSettings({ sfxVolume: '0.3' }).sfxVolume).toBe(defaultSettings().sfxVolume);
  });

  it('fills missing fields (older saves)', () => {
    expect(parseSettings({ language: 'en' })).toEqual({ ...defaultSettings(), language: 'en' });
  });

  it('uses the given defaults', () => {
    expect(parseSettings(null, defaultSettings(true)).reduceEffects).toBe(true);
  });
});

describe('load/save', () => {
  it('round-trips through the store', () => {
    const store = memoryStore();
    expect(saveSettings(store, custom)).toBe(true);
    expect(store.data.has(SETTINGS_KEY)).toBe(true);
    expect(loadSettings(store)).toEqual(custom);
  });

  it('loads defaults when nothing was saved, the JSON is broken or storage is unavailable', () => {
    expect(loadSettings(memoryStore())).toEqual(defaultSettings());
    expect(loadSettings(memoryStore({ [SETTINGS_KEY]: '{oops' }))).toEqual(defaultSettings());
    expect(loadSettings(null)).toEqual(defaultSettings());
    expect(saveSettings(null, custom)).toBe(false);
  });
});
