// Interface texts. pt-BR is the reference; every language must define every key
// (enforced by the Record type). Placeholders like {n} are filled by `t(key, { n })`.
import type { CosmeticType, Rarity } from '../cosmetics/types.ts';
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
  shop: 'Loja',
  coins: 'Moedas',
  ranking: 'Ranking',
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
  reportCoins: 'Moedas ganhas',
  reportCoinsScore: '{n} pela pontuação',
  reportCoinsGrade: '+{n} pela nota {grade}',
  reportCoinsMode: '×{pct}% no modo {mode}',
  reportBalance: 'Saldo: {n}',

  // Shop and inventory
  shopTitle: 'Loja',
  shopTabToday: 'Loja do dia',
  shopTabInventory: 'Inventário',
  shopRotation: 'Nova seleção em {time}',
  shopDeal: 'Oferta do dia',
  shopBuy: 'Comprar · {price}',
  shopConfirm: 'Confirmar · {price}',
  shopConfirmHint: 'Clique de novo para confirmar a compra.',
  shopEquip: 'Equipar',
  shopEquipped: 'Equipado',
  shopOwned: 'Adquirido',
  shopDefault: 'Padrão',
  shopLocked: 'Bloqueado',
  shopInShop: 'Na loja hoje',
  shopMissing: 'Faltam {n} moedas',
  shopUnavailable: 'Fora da loja hoje',
  shopUnavailableHint: 'Itens bloqueados entram na loja do dia em rodízio.',
  shopBought: 'Comprado: {item}. Já pode equipar.',
  shopEquippedNow: 'Equipado: {item}.',
  shopChanged: 'A loja mudou. Confira as novas ofertas.',
  shopPreview: 'Prévia ao vivo',
  shopFree: 'Grátis',
  typeCannon: 'Canhão',
  typeTheme: 'Tema',
  typeLaserColor: 'Cor do laser',
  typeExplosion: 'Explosão',
  typeWordBorder: 'Borda das palavras',
  rarityCommon: 'Comum',
  rarityRare: 'Raro',
  rarityEpic: 'Épico',
  rarityLegendary: 'Lendário',

  // Account (Google link) and nickname
  accountConnecting: 'Conectando…',
  accountOffline: 'Sem conexão',
  accountRetry: 'Tentar de novo',
  accountGuest: 'Convidado',
  accountSignIn: 'Entrar com Google',
  accountLinked: 'Conta Google vinculada',
  accountEditNickname: 'Editar apelido',
  authLinked: 'Conta Google vinculada! Seus recordes agora entram no ranking.',
  authSwitched: 'Você entrou na sua conta Google existente. O progresso desta sessão anônima não foi transferido.',
  authBlocked: 'O navegador bloqueou a janela do Google. Permita pop-ups para este site e tente de novo.',
  authError: 'Não foi possível entrar com o Google. Tente de novo.',
  nicknameTitleFirst: 'Escolha seu apelido',
  nicknameTitle: 'Editar apelido',
  nicknameHintFirst: 'É assim que você aparece no ranking. Não use seu nome real. De 3 a 12 caracteres: letras, números, _ e espaço.',
  nicknameHint: 'De 3 a 12 caracteres: letras, números, _ e espaço. O novo apelido aparece no ranking a partir do próximo recorde.',
  nicknameLabel: 'Apelido',
  nicknameInvalid: 'Use de 3 a 12 caracteres: letras, números, _ e espaço.',
  nicknameSave: 'Salvar',
  nicknameCancel: 'Cancelar',
  nicknameKeep: 'Usar sugestão',

  // Ranking
  rankingTitle: 'Ranking',
  rankingColName: 'Piloto',
  rankingColScore: 'Pontos',
  rankingColWpm: 'WPM',
  rankingColAccuracy: 'Precisão',
  rankingYou: 'você',
  rankingLoading: 'Carregando ranking…',
  rankingEmpty: 'Ninguém neste ranking ainda. Seja o primeiro!',
  rankingError: 'Não foi possível carregar o ranking.',
  rankingUnavailable: 'Ranking indisponível: esta versão do jogo está sem servidor.',
  rankingRetry: 'Tentar de novo',
  rankingHint: 'Só contas Google entram no ranking. O modo Zen não conta.',
  reportRankSending: 'Enviando ao ranking…',
  reportRankRecord: 'Novo recorde no ranking!',
  reportRankNotRecord: 'Seu recorde neste ranking: {n}.',
  reportRankSignIn: 'Entre com Google para aparecer no ranking.',
  reportRankZen: 'O modo Zen não entra no ranking.',
  reportRankInvalid: 'Esta partida está fora dos limites do ranking.',
  reportRankError: 'Não foi possível enviar ao ranking.',

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
  shop: 'Shop',
  coins: 'Coins',
  ranking: 'Ranking',
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
  reportCoins: 'Coins earned',
  reportCoinsScore: '{n} for the score',
  reportCoinsGrade: '+{n} for grade {grade}',
  reportCoinsMode: '×{pct}% in {mode} mode',
  reportBalance: 'Balance: {n}',

  shopTitle: 'Shop',
  shopTabToday: "Today's shop",
  shopTabInventory: 'Inventory',
  shopRotation: 'New selection in {time}',
  shopDeal: 'Deal of the day',
  shopBuy: 'Buy · {price}',
  shopConfirm: 'Confirm · {price}',
  shopConfirmHint: 'Click again to confirm the purchase.',
  shopEquip: 'Equip',
  shopEquipped: 'Equipped',
  shopOwned: 'Owned',
  shopDefault: 'Default',
  shopLocked: 'Locked',
  shopInShop: 'In the shop today',
  shopMissing: '{n} more coins needed',
  shopUnavailable: 'Not in the shop today',
  shopUnavailableHint: "Locked items rotate through today's shop.",
  shopBought: 'Bought: {item}. Ready to equip.',
  shopEquippedNow: 'Equipped: {item}.',
  shopChanged: 'The shop changed. Check the new offers.',
  shopPreview: 'Live preview',
  shopFree: 'Free',
  typeCannon: 'Cannon',
  typeTheme: 'Theme',
  typeLaserColor: 'Laser color',
  typeExplosion: 'Explosion',
  typeWordBorder: 'Word border',
  rarityCommon: 'Common',
  rarityRare: 'Rare',
  rarityEpic: 'Epic',
  rarityLegendary: 'Legendary',

  accountConnecting: 'Connecting…',
  accountOffline: 'Offline',
  accountRetry: 'Try again',
  accountGuest: 'Guest',
  accountSignIn: 'Sign in with Google',
  accountLinked: 'Google account linked',
  accountEditNickname: 'Edit nickname',
  authLinked: 'Google account linked! Your records now enter the ranking.',
  authSwitched: 'You signed into your existing Google account. Progress from this anonymous session was not carried over.',
  authBlocked: 'The browser blocked the Google window. Allow pop-ups for this site and try again.',
  authError: 'Could not sign in with Google. Please try again.',
  nicknameTitleFirst: 'Choose your nickname',
  nicknameTitle: 'Edit nickname',
  nicknameHintFirst: "This is how you appear in the ranking. Don't use your real name. 3 to 12 characters: letters, digits, _ and space.",
  nicknameHint: '3 to 12 characters: letters, digits, _ and space. The new nickname shows in the ranking from your next record.',
  nicknameLabel: 'Nickname',
  nicknameInvalid: 'Use 3 to 12 characters: letters, digits, _ and space.',
  nicknameSave: 'Save',
  nicknameCancel: 'Cancel',
  nicknameKeep: 'Keep suggestion',

  rankingTitle: 'Ranking',
  rankingColName: 'Pilot',
  rankingColScore: 'Score',
  rankingColWpm: 'WPM',
  rankingColAccuracy: 'Accuracy',
  rankingYou: 'you',
  rankingLoading: 'Loading ranking…',
  rankingEmpty: 'Nobody in this ranking yet. Be the first!',
  rankingError: 'Could not load the ranking.',
  rankingUnavailable: 'Ranking unavailable: this build of the game has no server.',
  rankingRetry: 'Try again',
  rankingHint: 'Only Google accounts enter the ranking. Zen mode does not count.',
  reportRankSending: 'Sending to the ranking…',
  reportRankRecord: 'New ranking record!',
  reportRankNotRecord: 'Your record on this board: {n}.',
  reportRankSignIn: 'Sign in with Google to appear in the ranking.',
  reportRankZen: 'Zen mode does not enter the ranking.',
  reportRankInvalid: 'This match is outside the ranking limits.',
  reportRankError: 'Could not send to the ranking.',

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

export const TYPE_LABEL: Readonly<Record<CosmeticType, StringKey>> = {
  cannon: 'typeCannon',
  theme: 'typeTheme',
  laserColor: 'typeLaserColor',
  explosion: 'typeExplosion',
  wordBorder: 'typeWordBorder',
};

export const RARITY_LABEL: Readonly<Record<Rarity, StringKey>> = {
  common: 'rarityCommon',
  rare: 'rarityRare',
  epic: 'rarityEpic',
  legendary: 'rarityLegendary',
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
