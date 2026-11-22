// Player settings (pure model) persisted in localStorage.
// They stay on this device (users/{uid} has no settings fields in firestore.rules).
import { CONFIG } from '../config.ts';
import { GAME_DIFFICULTIES, type GameDifficulty } from '../game/types.ts';
import { MODE_IDS, type ModeId } from '../modes/types.ts';
import { clamp } from '../utils/math.ts';
import { loadJson, saveJson, type KeyValueStore } from '../utils/storage.ts';
import { LANGUAGES, type Language } from '../words/types.ts';

export interface Settings {
  /** Interface and word-list language. */
  readonly language: Language;
  /** Sound effects volume, 0..1. */
  readonly sfxVolume: number;
  /** "Reduzir efeitos": no screen shake, no screen flash, static background, half the particles. */
  readonly reduceEffects: boolean;
  /** "Acentos obrigatórios": `ação` must be typed with ç and ã. */
  readonly requireAccents: boolean;
  /** Last choices in the main menu. */
  readonly mode: ModeId;
  readonly difficulty: GameDifficulty;
}

/** Bump the version when the shape changes incompatibly. */
export const SETTINGS_KEY = 'lasertype.settings.v1';

/** First-run settings. People who ask their OS for less motion start with reduced effects. */
export function defaultSettings(prefersReducedMotion = false): Settings {
  return {
    language: CONFIG.defaultLanguage,
    sfxVolume: 0.6,
    reduceEffects: prefersReducedMotion,
    requireAccents: false,
    mode: 'survival',
    difficulty: 'normal',
  };
}

function oneOf<T extends string>(options: readonly T[], value: unknown, fallback: T): T {
  return options.find((option) => option === value) ?? fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Turns whatever was stored (possibly old, partial or tampered with) into valid settings:
 * each field is checked on its own and falls back to the default when invalid.
 */
export function parseSettings(raw: unknown, defaults: Settings = defaultSettings()): Settings {
  if (typeof raw !== 'object' || raw === null) return defaults;
  const data = raw as Record<string, unknown>;
  const volume = data.sfxVolume;
  return {
    language: oneOf(LANGUAGES, data.language, defaults.language),
    sfxVolume: typeof volume === 'number' && Number.isFinite(volume) ? clamp(volume, 0, 1) : defaults.sfxVolume,
    reduceEffects: bool(data.reduceEffects, defaults.reduceEffects),
    requireAccents: bool(data.requireAccents, defaults.requireAccents),
    mode: oneOf(MODE_IDS, data.mode, defaults.mode),
    difficulty: oneOf(GAME_DIFFICULTIES, data.difficulty, defaults.difficulty),
  };
}

export function loadSettings(store: KeyValueStore | null, defaults: Settings = defaultSettings()): Settings {
  return parseSettings(loadJson(store, SETTINGS_KEY), defaults);
}

export function saveSettings(store: KeyValueStore | null, settings: Settings): boolean {
  return saveJson(store, SETTINGS_KEY, settings);
}
