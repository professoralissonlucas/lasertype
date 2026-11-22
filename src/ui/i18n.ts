// Interface texts. pt-BR is the reference; every language must define every key
// (enforced by the Record type). Placeholders like {n} are filled by `t(key, { n })`.
import type { Grade, GameDifficulty } from '../game/types.ts';
import type { ModeId } from '../modes/types.ts';
import type { Language } from '../words/types.ts';

const PT_BR = {
  // Menu
  tagline: 'Defenda a estação. Cada letra é um disparo.',
  menuMode: 'Modo',
  menuDifficulty: 'Dificuldade',
  menuLanguage: 'Idioma',
  play: 'Jogar',
  settings: 'Configurações',
  modeSurvival: 'Survival',
  modeSurvivalDesc: 'Sem fim. Resista até o escudo cair.',
  modeTimeAttack: 'Time Attack',
  modeTimeAttackDesc: '60 segundos para a maior pontuação.',
  modeZen: 'Zen',
  modeZenDesc: 'Sem dano. Treine no seu ritmo.',
  difficultyEasy: 'Fácil',
  difficultyNormal: 'Normal',
  difficultyHard: 'Difícil',

  // Settings
  settingsTitle: 'Configurações',
  settingsLanguage: 'Idioma (interface e palavras)',
  settingsVolume: 'Volume dos efeitos',
  settingsReduceEffects: 'Reduzir efeitos',
  settingsReduceEffectsHint: 'Sem tremor nem flashes na tela; fundo parado.',
  settingsAccents: 'Acentos obrigatórios',
  settingsAccentsHint: 'É preciso digitar ç, ã, é… exatamente.',
  settingsSaved: 'Salvo automaticamente neste navegador.',
  back: 'Voltar',

  // HUD
  shield: 'Escudo',
  charge: 'Carga EMP',
  chargeReady: 'Pronto — Espaço',
  combo: 'Combo',
  wave: 'Onda',
  time: 'Tempo',
  timeLeft: 'Restante',
  kills: 'Abates',
  accuracy: 'Precisão',
  wpm: 'WPM',
  slow: 'Lento',
  waveBanner: 'Onda {n}',
  combatLog: 'Registro de combate',
  causeBomb: 'Bomba',
  causeEmp: 'EMP',
  controlsHint: 'Digite para mirar · Backspace destrava · Espaço EMP · Esc pausa · Tab reinicia',

  // Pause
  pauseTitle: 'Pausado',
  resume: 'Continuar',
  restart: 'Reiniciar',
  quit: 'Encerrar',

  // Mission Report
  reportTitle: 'Relatório da missão',
  endShield: 'Escudo destruído',
  endTime: 'Tempo esgotado',
  endQuit: 'Missão encerrada',
  grade: 'Nota',
  statScore: 'Pontuação',
  statDestroyed: 'Palavras destruídas',
  statLost: 'Palavras perdidas',
  statAccuracy: 'Precisão',
  statWpm: 'WPM',
  statMaxCombo: 'Combo máximo',
  statWave: 'Onda alcançada',
  statTime: 'Tempo',
  statLetters: 'Letras certas',
  statErrors: 'Erros',
  statEmp: 'EMPs usados',
  playAgain: 'Jogar de novo',
  toMenu: 'Menu',

  canvasLabel: 'Campo de batalha: palavras caindo em direção ao perímetro',
} as const;

export type StringKey = keyof typeof PT_BR;
/** Every text key (pt-BR is the reference table). */
export const STRING_KEYS = Object.keys(PT_BR) as readonly StringKey[];
export type Translate = (key: StringKey, vars?: Readonly<Record<string, string | number>>) => string;

const EN: Readonly<Record<StringKey, string>> = {
  tagline: 'Defend the station. Every letter is a shot.',
  menuMode: 'Mode',
  menuDifficulty: 'Difficulty',
  menuLanguage: 'Language',
  play: 'Play',
  settings: 'Settings',
  modeSurvival: 'Survival',
  modeSurvivalDesc: 'Endless. Hold on until the shield falls.',
  modeTimeAttack: 'Time Attack',
  modeTimeAttackDesc: '60 seconds for the highest score.',
  modeZen: 'Zen',
  modeZenDesc: 'No damage. Practice at your own pace.',
  difficultyEasy: 'Easy',
  difficultyNormal: 'Normal',
  difficultyHard: 'Hard',

  settingsTitle: 'Settings',
  settingsLanguage: 'Language (interface and words)',
  settingsVolume: 'Sound effects volume',
  settingsReduceEffects: 'Reduce effects',
  settingsReduceEffectsHint: 'No screen shake or flashes; still background.',
  settingsAccents: 'Accents required',
  settingsAccentsHint: 'Accented letters (ç, ã, é…) must be typed exactly.',
  settingsSaved: 'Saved automatically in this browser.',
  back: 'Back',

  shield: 'Shield',
  charge: 'EMP charge',
  chargeReady: 'Ready — Space',
  combo: 'Combo',
  wave: 'Wave',
  time: 'Time',
  timeLeft: 'Left',
  kills: 'Kills',
  accuracy: 'Accuracy',
  wpm: 'WPM',
  slow: 'Slowed',
  waveBanner: 'Wave {n}',
  combatLog: 'Combat log',
  causeBomb: 'Bomb',
  causeEmp: 'EMP',
  controlsHint: 'Type to aim · Backspace unlocks · Space EMP · Esc pauses · Tab restarts',

  pauseTitle: 'Paused',
  resume: 'Resume',
  restart: 'Restart',
  quit: 'End mission',

  reportTitle: 'Mission Report',
  endShield: 'Shield destroyed',
  endTime: 'Time is up',
  endQuit: 'Mission ended',
  grade: 'Grade',
  statScore: 'Score',
  statDestroyed: 'Words destroyed',
  statLost: 'Words lost',
  statAccuracy: 'Accuracy',
  statWpm: 'WPM',
  statMaxCombo: 'Best combo',
  statWave: 'Wave reached',
  statTime: 'Time',
  statLetters: 'Correct letters',
  statErrors: 'Errors',
  statEmp: 'EMPs used',
  playAgain: 'Play again',
  toMenu: 'Menu',

  canvasLabel: 'Battlefield: words falling toward the perimeter',
};

const STRINGS: Readonly<Record<Language, Readonly<Record<StringKey, string>>>> = {
  'pt-BR': PT_BR,
  en: EN,
};

export const MODE_LABEL: Readonly<Record<ModeId, StringKey>> = {
  survival: 'modeSurvival',
  timeAttack: 'modeTimeAttack',
  zen: 'modeZen',
};

export const MODE_DESCRIPTION: Readonly<Record<ModeId, StringKey>> = {
  survival: 'modeSurvivalDesc',
  timeAttack: 'modeTimeAttackDesc',
  zen: 'modeZenDesc',
};

export const DIFFICULTY_LABEL: Readonly<Record<GameDifficulty, StringKey>> = {
  easy: 'difficultyEasy',
  normal: 'difficultyNormal',
  hard: 'difficultyHard',
};

/** Language names are shown in their own language, whatever the interface language. */
export const LANGUAGE_NAME: Readonly<Record<Language, string>> = {
  'pt-BR': 'Português',
  en: 'English',
};

/** Grades are letters in every language. */
export const GRADE_LABEL: Readonly<Record<Grade, string>> = { S: 'S', A: 'A', B: 'B', C: 'C', D: 'D' };

/** Replaces `{name}` placeholders; unknown placeholders are left as they are. */
export function interpolate(template: string, vars?: Readonly<Record<string, string | number>>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

export function createTranslator(lang: Language): Translate {
  const table = STRINGS[lang];
  return (key, vars) => interpolate(table[key], vars);
}
