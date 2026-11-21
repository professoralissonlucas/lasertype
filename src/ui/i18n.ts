import type { Language } from '../words/types.ts';

const PT_BR = {
  shield: 'Escudo',
  destroyed: 'Destruídas',
  controlsHint: 'Digite para mirar · Backspace destrava · Tab reinicia',
  gameOverTitle: 'Fim de jogo',
  statWords: 'Palavras destruídas',
  statAccuracy: 'Precisão',
  statTime: 'Tempo',
  restartHint: 'Enter ou Tab para jogar de novo',
  canvasLabel: 'Campo de batalha: palavras caindo em direção ao perímetro',
} as const;

export type StringKey = keyof typeof PT_BR;
export type Translate = (key: StringKey) => string;

const STRINGS: Readonly<Record<Language, Readonly<Record<StringKey, string>>>> = {
  'pt-BR': PT_BR,
  en: {
    shield: 'Shield',
    destroyed: 'Destroyed',
    controlsHint: 'Type to aim · Backspace unlocks · Tab restarts',
    gameOverTitle: 'Game over',
    statWords: 'Words destroyed',
    statAccuracy: 'Accuracy',
    statTime: 'Time',
    restartHint: 'Enter or Tab to play again',
    canvasLabel: 'Battlefield: words falling toward the perimeter',
  },
};

export function createTranslator(lang: Language): Translate {
  const table = STRINGS[lang];
  return (key) => table[key];
}
