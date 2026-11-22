// Cosmetic item catalog (pure data). Adding an item = adding an entry here (and to
// DISCOUNT_ORDER when it can be bought); the renderers only read `params`.
// The first item of each category is its free default (price 0, owned by everyone).
import { CONFIG } from '../config.ts';
import { PALETTE } from '../game/render/palette.ts';
import {
  COSMETIC_TYPES,
  type CosmeticItem,
  type CosmeticType,
  type Rarity,
} from './types.ts';

const price = (rarity: Rarity): number => CONFIG.economy.rarityPrice[rarity];

export const CATALOG: readonly CosmeticItem[] = [
  // ---------- Cannon ----------
  {
    id: 'cannon_sentinel',
    type: 'cannon',
    name: { 'pt-BR': 'Sentinela', en: 'Sentinel' },
    rarity: 'common',
    price: 0,
    // Military and sober: blue-grey steel.
    params: {
      body: 'armored',
      barrel: 'single',
      hull: ['#1A2330', '#3B4A5D', '#71839A'],
      edge: '#080C13',
      highlight: '#B4C2D3',
      trim: '#8A9BB0',
      opacity: 1,
    },
  },
  {
    id: 'cannon_twin',
    type: 'cannon',
    name: { 'pt-BR': 'Gêmeo', en: 'Twin' },
    rarity: 'rare',
    price: price('rare'),
    // Heavy industrial mount, two barrels firing in turns.
    params: {
      body: 'heavy',
      barrel: 'twin',
      hull: ['#1C2533', '#4A5668', '#98A6B9'],
      edge: '#0A0F18',
      highlight: '#D5DDE8',
      trim: '#67E8F9',
      opacity: 1,
    },
  },
  {
    id: 'cannon_crystal',
    type: 'cannon',
    name: { 'pt-BR': 'Cristal', en: 'Crystal' },
    rarity: 'epic',
    price: price('epic'),
    // Translucent prisms with reflections; the core glows through the gem.
    params: {
      body: 'crystal',
      barrel: 'prism',
      hull: ['#3B1A7A', '#7C4DE8', '#D4C6FF'],
      edge: '#E4DCFF',
      highlight: '#FFFFFF',
      trim: '#B79CFF',
      opacity: 0.62,
    },
  },
  {
    id: 'cannon_halo',
    type: 'cannon',
    name: { 'pt-BR': 'Halo', en: 'Halo' },
    rarity: 'legendary',
    price: price('legendary'),
    // Sleek white turret inside an orbital ring of nodes.
    params: {
      body: 'orbital',
      barrel: 'rail',
      hull: ['#4E5D73', '#B5C2D3', '#EEF2F7'],
      edge: '#2B3646',
      highlight: '#FFFFFF',
      trim: '#22D3EE',
      opacity: 1,
    },
  },

  // ---------- Theme (canvas background) ----------
  {
    id: 'theme_orbital',
    type: 'theme',
    name: { 'pt-BR': 'Orbital', en: 'Orbital' },
    rarity: 'common',
    price: 0,
    params: {
      background: PALETTE.bg,
      nebula: [PALETTE.primary, PALETTE.danger],
      nebulaAlpha: 0.2,
      nebulaSeed: 'orbital-defense-nebula',
      starColor: PALETTE.text,
      grid: null,
    },
  },
  {
    id: 'theme_aurora',
    type: 'theme',
    name: { 'pt-BR': 'Aurora', en: 'Aurora' },
    rarity: 'common',
    price: price('common'),
    params: {
      background: '#03090B',
      nebula: ['#34D399', '#8B5CF6'],
      nebulaAlpha: 0.22,
      nebulaSeed: 'aurora-nebula',
      starColor: '#D1FAE5',
      grid: null,
    },
  },
  {
    id: 'theme_supergiant',
    type: 'theme',
    name: { 'pt-BR': 'Supergigante', en: 'Supergiant' },
    rarity: 'rare',
    price: price('rare'),
    params: {
      background: '#0B0505',
      nebula: ['#F97316', '#DC2626'],
      nebulaAlpha: 0.2,
      nebulaSeed: 'supergiant-nebula',
      starColor: '#FEF3C7',
      grid: null,
    },
  },
  {
    id: 'theme_void',
    type: 'theme',
    name: { 'pt-BR': 'Vazio', en: 'Void' },
    rarity: 'epic',
    price: price('epic'),
    params: {
      background: '#020108',
      nebula: ['#6D28D9', '#1D4ED8'],
      nebulaAlpha: 0.26,
      nebulaSeed: 'void-nebula',
      starColor: '#C7D2FE',
      grid: { color: '#818CF8', alpha: 0.08, spacing: 56 },
    },
  },

  // ---------- Laser color ----------
  {
    id: 'laser_cyan',
    type: 'laserColor',
    name: { 'pt-BR': 'Ciano', en: 'Cyan' },
    rarity: 'common',
    price: 0,
    params: { core: PALETTE.text, glow: PALETTE.primary, width: 1 },
  },
  {
    id: 'laser_emerald',
    type: 'laserColor',
    name: { 'pt-BR': 'Esmeralda', en: 'Emerald' },
    rarity: 'common',
    price: price('common'),
    params: { core: '#ECFDF5', glow: '#34D399', width: 1 },
  },
  {
    id: 'laser_violet',
    type: 'laserColor',
    name: { 'pt-BR': 'Violeta', en: 'Violet' },
    rarity: 'common',
    price: price('common'),
    params: { core: '#F5F3FF', glow: '#A78BFA', width: 1 },
  },
  {
    id: 'laser_plasma',
    type: 'laserColor',
    name: { 'pt-BR': 'Plasma', en: 'Plasma' },
    rarity: 'rare',
    price: price('rare'),
    params: { core: '#FFFFFF', glow: '#60A5FA', width: 1.6 },
  },

  // ---------- Explosion ----------
  {
    id: 'explosion_fragment',
    type: 'explosion',
    name: { 'pt-BR': 'Fragmentação', en: 'Fragmentation' },
    rarity: 'common',
    price: 0,
    params: {
      main: PALETTE.primary,
      accent: PALETTE.combo,
      letters: 'scatter',
      debris: 'spark',
      debrisCount: 1,
      debrisSpeed: 1,
      gravity: 1,
      inward: false,
      embers: 1,
      rings: 1,
      ringScale: 1,
    },
  },
  {
    id: 'explosion_supernova',
    type: 'explosion',
    name: { 'pt-BR': 'Supernova', en: 'Supernova' },
    rarity: 'rare',
    price: price('rare'),
    params: {
      main: '#FDE68A',
      accent: '#FB923C',
      letters: 'scatter',
      debris: 'spark',
      debrisCount: 1.5,
      debrisSpeed: 1.3,
      gravity: 0.6,
      inward: false,
      embers: 1.8,
      rings: 2,
      ringScale: 1.6,
    },
  },
  {
    id: 'explosion_disintegrate',
    type: 'explosion',
    name: { 'pt-BR': 'Desintegração', en: 'Disintegration' },
    rarity: 'epic',
    price: price('epic'),
    params: {
      main: '#A78BFA',
      accent: '#22D3EE',
      letters: 'dissolve',
      debris: 'square',
      debrisCount: 1.2,
      debrisSpeed: 0.6,
      gravity: -0.4,
      inward: false,
      embers: 0.6,
      rings: 1,
      ringScale: 0.8,
    },
  },
  {
    id: 'explosion_implosion',
    type: 'explosion',
    name: { 'pt-BR': 'Implosão', en: 'Implosion' },
    rarity: 'legendary',
    price: price('legendary'),
    params: {
      main: '#E0F2FE',
      accent: '#38BDF8',
      letters: 'collapse',
      debris: 'spark',
      debrisCount: 1.2,
      debrisSpeed: 1,
      gravity: 0,
      inward: true,
      embers: 1.2,
      rings: 2,
      ringScale: 1.2,
    },
  },

  // ---------- Word border ----------
  {
    id: 'border_rounded',
    type: 'wordBorder',
    name: { 'pt-BR': 'Arredondada', en: 'Rounded' },
    rarity: 'common',
    price: 0,
    params: { shape: 'rounded', color: PALETTE.muted, alpha: 0.35, width: 1 },
  },
  {
    id: 'border_chamfer',
    type: 'wordBorder',
    name: { 'pt-BR': 'Chanfrada', en: 'Chamfered' },
    rarity: 'common',
    price: price('common'),
    params: { shape: 'chamfer', color: '#94A3B8', alpha: 0.55, width: 1 },
  },
  {
    id: 'border_brackets',
    type: 'wordBorder',
    name: { 'pt-BR': 'Colchetes', en: 'Brackets' },
    rarity: 'common',
    price: price('common'),
    params: { shape: 'brackets', color: '#E2E8F0', alpha: 0.7, width: 1.5 },
  },
  {
    id: 'border_circuit',
    type: 'wordBorder',
    name: { 'pt-BR': 'Circuito', en: 'Circuit' },
    rarity: 'rare',
    price: price('rare'),
    params: { shape: 'circuit', color: '#A78BFA', alpha: 0.6, width: 1 },
  },
];

/**
 * Every purchasable item, in a fixed order: the daily discount is
 * DISCOUNT_ORDER[dayIndex % DISCOUNT_ORDER.length] (no rng, so Firestore rules can
 * redo the math). Categories alternate so consecutive days discount different things.
 * Changing this list changes which item is discounted on every future day: run
 * `npm run seed:shop` with it (the rules read the copy in shop/_config.discountOrder).
 */
export const DISCOUNT_ORDER: readonly string[] = [
  'cannon_twin',
  'theme_aurora',
  'laser_emerald',
  'explosion_supernova',
  'border_chamfer',
  'cannon_crystal',
  'theme_supergiant',
  'laser_violet',
  'explosion_disintegrate',
  'border_brackets',
  'cannon_halo',
  'theme_void',
  'laser_plasma',
  'explosion_implosion',
  'border_circuit',
];

const BY_ID: ReadonlyMap<string, CosmeticItem> = new Map(CATALOG.map((item) => [item.id, item]));

export function getItem(id: string): CosmeticItem | undefined {
  return BY_ID.get(id);
}

/** Items of one category, default first (catalog order). */
export function itemsOfType<T extends CosmeticType>(type: T): Extract<CosmeticItem, { type: T }>[] {
  return CATALOG.filter((item): item is Extract<CosmeticItem, { type: T }> => item.type === type);
}

/** Free items everyone owns from the start (price 0). */
export function isDefaultItem(item: CosmeticItem): boolean {
  return item.price === 0;
}

/** Items the shop can sell (priced; not default, not achievement-only). */
export function isPurchasable(item: CosmeticItem): boolean {
  return item.price !== null && item.price > 0;
}

/** The default item id of each category. */
export const DEFAULT_ITEM_IDS: Readonly<Record<CosmeticType, string>> = Object.fromEntries(
  COSMETIC_TYPES.map((type) => {
    const item = CATALOG.find((entry) => entry.type === type && isDefaultItem(entry));
    if (!item) throw new Error(`catalog: no default item for ${type}`);
    return [type, item.id];
  }),
) as Record<CosmeticType, string>;
