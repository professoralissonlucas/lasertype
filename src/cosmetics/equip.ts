// Resolves which cosmetics are equipped into the parameters the renderers draw with. Pure.
import { DEFAULT_ITEM_IDS, getItem } from './catalog.ts';
import type { CosmeticItem, CosmeticParams, CosmeticType, ResolvedCosmetics } from './types.ts';

function defaultParams<T extends CosmeticType>(type: T): CosmeticParams[T] {
  const item = getItem(DEFAULT_ITEM_IDS[type]);
  if (!item || item.type !== type) throw new Error(`catalog: bad default for ${type}`);
  return item.params as CosmeticParams[T];
}

/** The look everyone starts with. */
export const DEFAULT_COSMETICS: ResolvedCosmetics = {
  cannon: defaultParams('cannon'),
  theme: defaultParams('theme'),
  laserColor: defaultParams('laserColor'),
  explosion: defaultParams('explosion'),
  wordBorder: defaultParams('wordBorder'),
};

/**
 * Parameters per category. An unknown id, an item of another category or an item the
 * player does not own falls back to that category's default.
 */
export function resolveCosmetics(
  equipped: Readonly<Partial<Record<CosmeticType, string>>>,
  owns: (itemId: string) => boolean,
): ResolvedCosmetics {
  const pick = <T extends CosmeticType>(type: T): CosmeticParams[T] => {
    const id = equipped[type];
    const item = id === undefined ? undefined : getItem(id);
    if (item && item.type === type && owns(item.id)) return item.params as CosmeticParams[T];
    return DEFAULT_COSMETICS[type];
  };
  return {
    cannon: pick('cannon'),
    theme: pick('theme'),
    laserColor: pick('laserColor'),
    explosion: pick('explosion'),
    wordBorder: pick('wordBorder'),
  };
}

/** `base` with one item swapped in (shop preview: the item on top of what is equipped). */
export function withItem(base: ResolvedCosmetics, item: CosmeticItem): ResolvedCosmetics {
  switch (item.type) {
    case 'cannon':
      return { ...base, cannon: item.params };
    case 'theme':
      return { ...base, theme: item.params };
    case 'laserColor':
      return { ...base, laserColor: item.params };
    case 'explosion':
      return { ...base, explosion: item.params };
    case 'wordBorder':
      return { ...base, wordBorder: item.params };
  }
}
