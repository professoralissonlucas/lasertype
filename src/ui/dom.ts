// Small DOM helpers (no innerHTML anywhere: all text goes through textContent).

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A button with an optional keyboard shortcut badge (`<kbd>`). */
export function button(
  className: string,
  label: string,
  onClick: () => void,
  shortcut?: string,
): HTMLButtonElement {
  const node = el('button', className);
  node.type = 'button';
  node.append(el('span', undefined, label));
  if (shortcut) node.append(el('kbd', undefined, shortcut));
  node.addEventListener('click', onClick);
  return node;
}

/** A link that opens in a new tab without giving it access to this page. */
export function externalLink(href: string, text: string): HTMLAnchorElement {
  const node = el('a', undefined, text);
  node.href = href;
  node.target = '_blank';
  node.rel = 'noopener noreferrer';
  return node;
}

export interface RadioOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly description?: string;
  /** Extra line under the description (the caller keeps it up to date). */
  readonly note?: HTMLElement;
}

/**
 * A `<fieldset>` of radio buttons styled as cards or a segmented control.
 * Native radios: arrow keys move inside the group, Tab moves between groups.
 */
export function radioGroup<T extends string>(
  className: string,
  legend: string,
  name: string,
  options: readonly RadioOption<T>[],
  selected: T,
  onChange: (value: T) => void,
): HTMLFieldSetElement {
  const fieldset = el('fieldset', `choice ${className}`);
  fieldset.append(el('legend', 'choice__legend', legend));
  const items = el('div', 'choice__items');
  for (const option of options) {
    const label = el('label', 'choice__option');
    const input = el('input');
    input.type = 'radio';
    input.name = name;
    input.value = option.value;
    input.checked = option.value === selected;
    input.addEventListener('change', () => {
      if (input.checked) onChange(option.value);
    });
    const body = el('span', 'choice__body');
    body.append(el('span', 'choice__label', option.label));
    if (option.description) body.append(el('span', 'choice__desc', option.description));
    if (option.note) body.append(option.note);
    label.append(input, body);
    items.append(label);
  }
  fieldset.append(items);
  return fieldset;
}

/** Restarts a CSS animation by removing and re-adding its class. */
export function replayAnimation(node: HTMLElement, className: string): void {
  node.classList.remove(className);
  void node.offsetWidth; // force reflow so the animation starts over
  node.classList.add(className);
}
