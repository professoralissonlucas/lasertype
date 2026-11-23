// Collections (pure data): owning every item of a set (the `set` of the catalog items) gives its
// title. Owning a title is derived, never stored; only the one in use is (equipped.title).
import { CATALOG } from './catalog.ts';
import type { CollectionId, CosmeticItem, LocalizedText } from './types.ts';

export interface Collection {
  /** = `set` of its items. */
  readonly id: CollectionId;
  readonly name: LocalizedText;
  /** Stable id (stored in equipped.title). */
  readonly titleId: string;
  readonly title: LocalizedText;
  readonly items: readonly CosmeticItem[];
}

const collection = (id: CollectionId, name: LocalizedText, title: LocalizedText): Collection => ({
  id,
  name,
  titleId: `title_${id}`,
  title,
  items: CATALOG.filter((item) => item.set === id),
});

export const COLLECTIONS: readonly Collection[] = [
  collection('aurora', { 'pt-BR': 'Aurora', en: 'Aurora' }, { 'pt-BR': 'Vigia da Aurora', en: 'Aurora Watch' }),
  collection('solar', { 'pt-BR': 'Forja Solar', en: 'Solar Forge' }, { 'pt-BR': 'Coração Solar', en: 'Solar Heart' }),
  collection('prism', { 'pt-BR': 'Prisma', en: 'Prism' }, { 'pt-BR': 'Luz Refratada', en: 'Refracted Light' }),
  collection('horizon', { 'pt-BR': 'Horizonte', en: 'Horizon' }, { 'pt-BR': 'Além do Horizonte', en: 'Beyond the Horizon' }),
  collection('golden', { 'pt-BR': 'Conquistas', en: 'Achievements' }, { 'pt-BR': 'Lenda Orbital', en: 'Orbital Legend' }),
];

/** The collection that gives a title. */
export function collectionOfTitle(titleId: string): Collection | undefined {
  return COLLECTIONS.find((entry) => entry.titleId === titleId);
}

export function isComplete(entry: Collection, owns: (itemId: string) => boolean): boolean {
  return entry.items.every((item) => owns(item.id));
}

/** Does someone who owns these items have the title? */
export function ownsTitle(titleId: string, owns: (itemId: string) => boolean): boolean {
  const entry = collectionOfTitle(titleId);
  return entry !== undefined && isComplete(entry, owns);
}
