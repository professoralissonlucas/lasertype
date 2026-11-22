// Settings screen. Every change is applied and saved immediately; Esc or "Voltar" returns.
import type { Settings } from '../settings/settings.ts';
import { LANGUAGES } from '../words/types.ts';
import { button, el, radioGroup } from './dom.ts';
import { LANGUAGE_NAME, type Translate } from './i18n.ts';

export interface SettingsCallbacks {
  onChange(settings: Settings): void;
  /** Volume slider released: play a sample so the level can be heard. */
  onVolumePreview(): void;
  onBack(): void;
}

function toggle(label: string, hint: string, checked: boolean, onChange: (value: boolean) => void): HTMLLabelElement {
  const row = el('label', 'setting setting--toggle');
  const input = el('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  const text = el('span', 'setting__text');
  text.append(el('span', 'setting__label', label), el('span', 'setting__hint', hint));
  row.append(input, el('span', 'switch'), text);
  return row;
}

export class SettingsScreen {
  readonly root: HTMLElement;
  private settings: Settings;
  private readonly callbacks: SettingsCallbacks;
  private readonly backButton: HTMLButtonElement;

  constructor(t: Translate, initial: Settings, callbacks: SettingsCallbacks) {
    this.settings = initial;
    this.callbacks = callbacks;
    this.root = el('section', 'screen panel settings');
    this.root.setAttribute('aria-labelledby', 'settings-title');
    this.root.hidden = true;

    const title = el('h1', 'panel__title', t('settingsTitle'));
    title.id = 'settings-title';

    const update = (patch: Partial<Settings>): void => {
      this.settings = { ...this.settings, ...patch };
      callbacks.onChange(this.settings);
    };

    const language = radioGroup(
      'choice--segmented',
      t('settingsLanguage'),
      'settings-language',
      LANGUAGES.map((id) => ({ value: id, label: LANGUAGE_NAME[id] })),
      initial.language,
      (value) => update({ language: value }),
    );

    // Volume 0–100 %.
    const volumeRow = el('label', 'setting setting--range');
    const volumeText = el('span', 'setting__label', t('settingsVolume'));
    const volumeValue = el('output', 'setting__value', `${Math.round(initial.sfxVolume * 100)}%`);
    const volume = el('input');
    volume.type = 'range';
    volume.min = '0';
    volume.max = '100';
    volume.step = '5';
    volume.value = String(Math.round(initial.sfxVolume * 100));
    volume.addEventListener('input', () => {
      volumeValue.textContent = `${volume.value}%`;
      update({ sfxVolume: Number(volume.value) / 100 });
    });
    volume.addEventListener('change', () => callbacks.onVolumePreview());
    const volumeHead = el('span', 'setting__head');
    volumeHead.append(volumeText, volumeValue);
    volumeRow.append(volumeHead, volume);

    const reduce = toggle(t('settingsReduceEffects'), t('settingsReduceEffectsHint'), initial.reduceEffects, (value) =>
      update({ reduceEffects: value }),
    );
    const accents = toggle(t('settingsAccents'), t('settingsAccentsHint'), initial.requireAccents, (value) =>
      update({ requireAccents: value }),
    );

    this.backButton = button('btn', t('back'), () => callbacks.onBack(), 'Esc');
    const footer = el('div', 'panel__footer');
    footer.append(el('p', 'panel__note', t('settingsSaved')), this.backButton);

    this.root.append(title, language, volumeRow, reduce, accents, footer);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    if (visible) window.addEventListener('keydown', this.onKeyDown);
    else window.removeEventListener('keydown', this.onKeyDown);
  }

  /** Focuses the language choice (first control). */
  focus(): void {
    this.root.querySelector<HTMLInputElement>('input:checked')?.focus({ preventScroll: true });
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    this.callbacks.onBack();
  };
}
