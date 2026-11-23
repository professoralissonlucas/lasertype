// Shop screen: today's rotating shop (4 items, one discounted) and the inventory (every
// item by category, equip what you own), with a live preview of the selected item.
// Buying takes two clicks (Buy → Confirm). Esc or "Voltar" returns to the menu.
import type { SoundPlayer } from '../audio/types.ts';
import { getItem, itemsOfType } from '../cosmetics/catalog.ts';
import { withItem } from '../cosmetics/equip.ts';
import { COSMETIC_TYPES, type CosmeticItem, type CosmeticType, type ResolvedCosmetics } from '../cosmetics/types.ts';
import type { Economy } from '../economy/Economy.ts';
import type { PurchaseError, ShopOffer } from '../economy/types.ts';
import { achievementFor } from '../progression/achievements.ts';
import { formatCountdown } from '../utils/format.ts';
import type { Language } from '../words/types.ts';
import { button, el } from './dom.ts';
import { achievementDescription } from './progressText.ts';
import { RARITY_LABEL, TYPE_LABEL, type Translate } from './i18n.ts';
import { itemAction, itemSwatch } from './shopModel.ts';
import { ShopPreview } from './shopPreview.ts';

export interface ShopOptions {
  readonly t: Translate;
  readonly language: Language;
  readonly formatNumber: (value: number) => string;
  readonly economy: Economy;
  readonly sound: SoundPlayer;
  readonly reduceEffects: boolean;
  /** What is equipped right now (the preview swaps the selected item in). */
  readonly equipped: () => ResolvedCosmetics;
  readonly onBack: () => void;
}

type Tab = 'today' | 'inventory';

/** The Confirm step of a purchase expires after this long. */
const CONFIRM_MS = 4000;
/** Countdown refresh (also notices when the day turns). */
const TICK_MS = 1000;

interface Card {
  readonly item: CosmeticItem;
  readonly root: HTMLButtonElement;
  readonly status: HTMLElement;
}

/** "◉ 1.240" — a coin icon and an amount. */
function coinAmount(text: string, className = 'coins'): HTMLElement {
  const node = el('span', className);
  node.append(el('span', 'coin'), el('span', 'coins__value', text));
  return node;
}

export class ShopScreen {
  readonly root: HTMLElement;
  private readonly o: ShopOptions;
  private readonly preview: ShopPreview;
  private readonly wallet: HTMLElement;
  private readonly tabButtons: Record<Tab, HTMLButtonElement>;
  private readonly panels: Record<Tab, HTMLElement>;
  private readonly offersGrid: HTMLElement;
  private readonly rotation: HTMLElement;
  private readonly groupCounts = new Map<CosmeticType, HTMLElement>();
  private readonly detail: HTMLElement;
  private readonly detailMeta: HTMLElement;
  private readonly detailName: HTMLElement;
  private readonly detailPrice: HTMLElement;
  private readonly actionButton: HTMLButtonElement;
  private readonly actionLabel: HTMLElement;
  private readonly statusLine: HTMLElement;
  private offerCards: Card[] = [];
  private readonly inventoryCards: Card[] = [];
  private tab: Tab = 'today';
  private selectedId = '';
  private renderedDay = Number.NaN;
  private pendingBuy: string | null = null;
  private pendingTimer: number | null = null;
  private tickTimer: number | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(options: ShopOptions) {
    this.o = options;
    const { t } = options;
    this.root = el('section', 'screen shop');
    this.root.setAttribute('aria-labelledby', 'shop-title');
    this.root.hidden = true;

    const panel = el('div', 'panel shop__panel');

    const header = el('header', 'shop__header');
    const title = el('h1', 'panel__title', t('shopTitle'));
    title.id = 'shop-title';
    this.wallet = el('div', 'wallet');
    this.wallet.setAttribute('role', 'status');
    header.append(title, this.wallet);

    // Tabs.
    const tabs = el('div', 'shop__tabs');
    tabs.setAttribute('role', 'tablist');
    const tab = (id: Tab, label: string): HTMLButtonElement => {
      const node = el('button', 'shop__tab', label);
      node.type = 'button';
      node.id = `shop-tab-${id}`;
      node.setAttribute('role', 'tab');
      node.setAttribute('aria-controls', `shop-panel-${id}`);
      node.addEventListener('click', () => this.switchTab(id));
      return node;
    };
    this.tabButtons = { today: tab('today', t('shopTabToday')), inventory: tab('inventory', t('shopTabInventory')) };
    tabs.append(this.tabButtons.today, this.tabButtons.inventory);
    tabs.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const next: Tab = this.tab === 'today' ? 'inventory' : 'today';
      this.switchTab(next);
      this.tabButtons[next].focus();
    });

    const tabPanel = (id: Tab): HTMLElement => {
      const node = el('div', 'shop__tabpanel');
      node.id = `shop-panel-${id}`;
      node.setAttribute('role', 'tabpanel');
      node.setAttribute('aria-labelledby', `shop-tab-${id}`);
      return node;
    };

    // Today's shop.
    const today = tabPanel('today');
    this.offersGrid = el('div', 'shop__offers');
    this.rotation = el('p', 'shop__rotation');
    today.append(this.offersGrid, this.rotation);

    // Inventory, one group per category.
    const inventory = tabPanel('inventory');
    for (const type of COSMETIC_TYPES) {
      const group = el('section', 'shop__group');
      const heading = el('h2', 'shop__group-title');
      const count = el('span', 'shop__group-count');
      this.groupCounts.set(type, count);
      heading.append(el('span', undefined, t(TYPE_LABEL[type])), count);
      const grid = el('div', 'shop__grid');
      for (const item of itemsOfType(type)) {
        const card = this.buildCard(item, true);
        this.inventoryCards.push(card);
        grid.append(card.root);
      }
      group.append(heading, grid);
      inventory.append(group);
    }
    this.panels = { today, inventory };
    const main = el('div', 'shop__main');
    main.append(today, inventory);

    // Detail panel with the live preview.
    this.detail = el('aside', 'shop__detail');
    const stage = el('div', 'shop__stage');
    this.preview = new ShopPreview(options.equipped(), options.reduceEffects);
    stage.append(this.preview.canvas, el('span', 'shop__stage-label', t('shopPreview')));
    this.detailMeta = el('p', 'shop__detail-meta');
    this.detailName = el('h2', 'shop__detail-name');
    this.detailPrice = el('div', 'shop__detail-price');
    this.actionButton = el('button', 'btn btn--primary shop__action');
    this.actionButton.type = 'button';
    this.actionLabel = el('span');
    this.actionButton.append(this.actionLabel);
    this.actionButton.addEventListener('click', () => this.act());
    this.statusLine = el('p', 'shop__status');
    this.statusLine.setAttribute('aria-live', 'polite');
    this.detail.append(stage, this.detailMeta, this.detailName, this.detailPrice, this.actionButton, this.statusLine);

    const body = el('div', 'shop__body');
    body.append(main, this.detail);

    const footer = el('div', 'panel__footer');
    footer.append(el('p', 'panel__note', t('shopUnavailableHint')), button('btn', t('back'), () => options.onBack(), 'Esc'));

    panel.append(header, tabs, body, footer);
    this.root.append(panel);
    this.syncDay();
    this.switchTab('today');
  }

  setVisible(visible: boolean): void {
    if (visible === !this.root.hidden) return;
    this.root.hidden = !visible;
    if (visible) {
      window.addEventListener('keydown', this.onKeyDown);
      this.unsubscribe = this.o.economy.subscribe((_, change) => {
        this.refresh();
        // The cloud version arrived (or another account): the preview shows its cosmetics.
        if (change.type === 'sync') this.updatePreview();
      });
      this.tickTimer = window.setInterval(this.tick, TICK_MS);
      this.syncDay();
      this.ensureSelection();
      this.refresh();
      this.updatePreview();
      this.preview.start();
    } else {
      window.removeEventListener('keydown', this.onKeyDown);
      this.unsubscribe?.();
      this.unsubscribe = null;
      if (this.tickTimer !== null) window.clearInterval(this.tickTimer);
      this.tickTimer = null;
      this.clearPending();
      this.setStatus('');
      this.preview.stop();
    }
  }

  setReducedEffects(reduced: boolean): void {
    this.preview.setReducedEffects(reduced);
  }

  /** Focuses the selected item (or the active tab). */
  focus(): void {
    const card = this.visibleCards().find((entry) => entry.item.id === this.selectedId);
    (card?.root ?? this.tabButtons[this.tab]).focus({ preventScroll: true });
  }

  // ---------- State ----------

  private visibleCards(): readonly Card[] {
    return this.tab === 'today' ? this.offerCards : this.inventoryCards;
  }

  private offerFor(itemId: string): ShopOffer | undefined {
    return this.o.economy.today().offers.find((offer) => offer.itemId === itemId);
  }

  private switchTab(tab: Tab): void {
    this.tab = tab;
    for (const id of ['today', 'inventory'] as const) {
      const active = id === tab;
      this.tabButtons[id].setAttribute('aria-selected', String(active));
      this.tabButtons[id].tabIndex = active ? 0 : -1;
      this.panels[id].hidden = !active;
    }
    this.ensureSelection();
    this.refresh();
  }

  /** Keeps the selection when the tab shows it; otherwise picks the deal / the equipped item. */
  private ensureSelection(): void {
    const cards = this.visibleCards();
    if (cards.some((card) => card.item.id === this.selectedId)) return;
    const first = this.tab === 'today' ? cards[0] : cards.find((card) => this.o.economy.isEquipped(card.item.id));
    if (first) this.select(first.item.id);
  }

  private select(itemId: string): void {
    if (itemId !== this.selectedId) {
      this.clearPending();
      this.setStatus('');
    }
    this.selectedId = itemId;
    this.refresh();
    this.updatePreview();
  }

  /** The selected item on top of what is equipped. */
  private updatePreview(): void {
    const item = getItem(this.selectedId);
    if (item) this.preview.setCosmetics(withItem(this.o.equipped(), item));
  }

  /** Rebuilds the offer cards when the game day turned (or on first show, or when forced). */
  private syncDay(force = false): void {
    const shop = force ? this.o.economy.reloadShop() : this.o.economy.today();
    if (shop.day === this.renderedDay && !force) return;
    const changed = !Number.isNaN(this.renderedDay) && shop.day !== this.renderedDay;
    this.renderedDay = shop.day;
    this.offerCards = [];
    for (const offer of shop.offers) {
      const item = getItem(offer.itemId);
      if (!item) continue;
      this.offerCards.push(this.buildCard(item, false));
    }
    this.offersGrid.replaceChildren(...this.offerCards.map((card) => card.root));
    if (changed || force) {
      this.ensureSelection();
      this.refresh();
    }
    if (changed) this.setStatus(this.o.t('shopChanged'));
  }

  private setStatus(text: string, warn = false): void {
    this.statusLine.textContent = text;
    this.statusLine.classList.toggle('shop__status--warn', warn && text !== '');
  }

  private readonly tick = (): void => {
    this.syncDay();
    this.rotation.textContent = this.o.t('shopRotation', { time: formatCountdown(this.o.economy.msUntilRotation()) });
  };

  // ---------- Actions ----------

  private act(): void {
    const { economy, t, sound } = this.o;
    const item = getItem(this.selectedId);
    if (!item || economy.purchasing) return;
    const action = itemAction(item.id, economy.inventory, economy.today());
    const name = item.name[this.o.language];

    if (action.kind === 'equip') {
      if (economy.equip(item.id).ok) {
        sound.play('equip');
        this.setStatus(t('shopEquippedNow', { item: name }));
        this.updatePreview();
      }
      return;
    }
    if (action.kind !== 'buy') return;

    if (this.pendingBuy !== item.id) {
      // First click: ask for confirmation.
      this.pendingBuy = item.id;
      this.pendingTimer = window.setTimeout(() => {
        this.clearPending();
        this.refresh();
      }, CONFIRM_MS);
      this.setStatus(t('shopConfirmHint'));
      this.refresh();
      return;
    }

    // Second click: the purchase goes to the server (a transaction) and comes back.
    this.clearPending();
    this.setStatus(t('shopBuying'));
    const purchase = economy.buy(item.id, this.renderedDay);
    this.refresh();
    void purchase.then((result) => {
      if (result.ok) {
        sound.play('purchase');
        this.setStatus(t('shopBought', { item: name }));
      } else {
        this.onPurchaseError(result.error);
      }
      this.refresh();
    });
  }

  /** Nothing was charged in any of these cases; the player is told why. */
  private onPurchaseError(error: PurchaseError): void {
    const { t } = this.o;
    switch (error) {
      case 'notForSale':
        // The day turned while the screen was open.
        this.syncDay(true);
        this.setStatus(t('shopChanged'), true);
        break;
      case 'dayChanged':
        this.syncDay(true);
        this.setStatus(t('shopDayChanged'), true);
        break;
      case 'refused':
        this.syncDay(true);
        this.setStatus(t('shopRefused'), true);
        break;
      case 'offline':
        this.setStatus(t('shopOffline'), true);
        break;
      case 'syncing':
        this.setStatus(t('shopSyncing'), true);
        break;
      case 'owned':
        this.setStatus(t('shopOwnedElsewhere'), true);
        break;
      case 'insufficient':
        this.setStatus(t('shopInsufficientServer'), true);
        break;
      case 'busy':
      case 'unknown':
        this.setStatus('');
        break;
    }
    this.o.sound.play('miss');
  }

  private clearPending(): void {
    if (this.pendingTimer !== null) window.clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
    this.pendingBuy = null;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    this.o.onBack();
  };

  // ---------- Rendering ----------

  private buildCard(item: CosmeticItem, compact: boolean): Card {
    const { t, language } = this.o;
    const root = el('button', compact ? 'item-card item-card--compact' : 'item-card');
    root.type = 'button';
    root.dataset.rarity = item.rarity;
    const [a, b] = itemSwatch(item);
    const swatch = el('span', 'item-card__swatch');
    swatch.style.setProperty('--swatch-a', a);
    swatch.style.setProperty('--swatch-b', b);
    const head = el('span', 'item-card__head');
    if (!compact) head.append(el('span', 'item-card__type', t(TYPE_LABEL[item.type])));
    head.append(el('span', 'item-card__rarity', t(RARITY_LABEL[item.rarity])));
    const status = el('span', 'item-card__status');
    root.append(swatch, head, el('span', 'item-card__name', item.name[language]), status);
    if (!compact && this.offerFor(item.id)?.discounted) root.append(el('span', 'item-card__ribbon', t('shopDeal')));
    root.addEventListener('click', () => this.select(item.id));
    return { item, root, status };
  }

  /** Price tag of an offer (old price struck through when discounted). */
  private priceTag(offer: ShopOffer): HTMLElement {
    const { formatNumber } = this.o;
    const tag = el('span', 'price');
    if (offer.discounted) {
      tag.append(el('s', 'price__old', formatNumber(offer.basePrice)));
      const percent = Math.round((1 - offer.price / offer.basePrice) * 100);
      tag.append(el('span', 'price__badge', `−${percent}%`));
    }
    tag.append(coinAmount(formatNumber(offer.price)));
    return tag;
  }

  private cardStatus(card: Card): void {
    const { economy, t } = this.o;
    const id = card.item.id;
    const offer = this.offerFor(id);
    const owned = economy.owns(id);
    const equipped = economy.isEquipped(id);
    card.root.classList.toggle('is-selected', id === this.selectedId);
    card.root.setAttribute('aria-pressed', String(id === this.selectedId));
    card.root.classList.toggle('is-owned', owned);
    card.root.classList.toggle('is-equipped', equipped);
    card.root.classList.toggle('is-locked', !owned && !offer);
    if (equipped) card.status.replaceChildren(t('shopEquipped'));
    else if (owned) card.status.replaceChildren(t(card.item.price === 0 ? 'shopDefault' : 'shopOwned'));
    else if (offer) card.status.replaceChildren(this.priceTag(offer));
    else card.status.replaceChildren(t(achievementFor(id) ? 'shopAchievement' : 'shopLocked'));
  }

  private refresh(): void {
    const { economy, t, formatNumber } = this.o;
    this.wallet.replaceChildren(coinAmount(formatNumber(economy.coins)));
    this.wallet.setAttribute('aria-label', `${t('coins')}: ${formatNumber(economy.coins)}`);
    for (const card of this.offerCards) this.cardStatus(card);
    for (const card of this.inventoryCards) this.cardStatus(card);
    for (const type of COSMETIC_TYPES) {
      const items = itemsOfType(type);
      const owned = items.filter((item) => economy.owns(item.id)).length;
      this.groupCounts.get(type)?.replaceChildren(`${owned}/${items.length}`);
    }
    this.rotation.textContent = t('shopRotation', { time: formatCountdown(economy.msUntilRotation()) });
    this.refreshDetail();
  }

  private refreshDetail(): void {
    const { economy, t, language, formatNumber } = this.o;
    const item = getItem(this.selectedId);
    if (!item) return;
    this.detail.dataset.rarity = item.rarity;
    this.detailMeta.textContent = `${t(TYPE_LABEL[item.type])} · ${t(RARITY_LABEL[item.rarity])}`;
    this.detailName.textContent = item.name[language];

    const action = itemAction(item.id, economy.inventory, economy.today());
    const button = this.actionButton;
    button.classList.remove('is-confirm');
    switch (action.kind) {
      case 'equipped':
        this.actionLabel.textContent = t('shopEquipped');
        button.disabled = true;
        break;
      case 'equip':
        this.actionLabel.textContent = t('shopEquip');
        button.disabled = false;
        break;
      case 'buy': {
        if (economy.purchasing) {
          // Waiting for the server: no second purchase meanwhile.
          this.actionLabel.textContent = t('shopBuying');
          button.disabled = true;
          break;
        }
        const price = formatNumber(action.offer.price);
        const confirming = this.pendingBuy === item.id;
        this.actionLabel.textContent = t(confirming ? 'shopConfirm' : 'shopBuy', { price });
        button.classList.toggle('is-confirm', confirming);
        button.disabled = false;
        break;
      }
      case 'insufficient':
        this.actionLabel.textContent = t('shopMissing', { n: formatNumber(action.missing) });
        button.disabled = true;
        break;
      case 'achievement':
        this.actionLabel.textContent = t('shopAchievementOnly');
        button.disabled = true;
        break;
      case 'unavailable':
        this.actionLabel.textContent = t('shopUnavailable');
        button.disabled = true;
        break;
    }

    const offer = this.offerFor(item.id);
    if (economy.owns(item.id)) {
      this.detailPrice.replaceChildren(t(item.price === 0 ? 'shopFree' : 'shopOwned'));
    } else if (offer) {
      const tag = this.priceTag(offer);
      if (offer.discounted) tag.prepend(el('span', 'price__deal', t('shopDeal')));
      this.detailPrice.replaceChildren(tag);
    } else if (action.kind === 'achievement') {
      this.detailPrice.replaceChildren(achievementDescription(t, action.achievement));
    } else {
      this.detailPrice.replaceChildren(t('shopLocked'));
    }
  }
}
