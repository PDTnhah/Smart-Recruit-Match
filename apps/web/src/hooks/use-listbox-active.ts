import { useState } from 'react';

/**
 * The highlighted option of a combobox's list, -1 for none; `optionKeys` identify the options
 * shown. ArrowDown from none goes to the first option, ArrowUp to the last. A highlight belongs to
 * the list it was made on: once the options change (new search results), none is highlighted, so
 * Enter never picks an option that was not highlighted on screen.
 */
export function useListboxActive(optionKeys: readonly (string | number)[]) {
  const list = optionKeys.join(',');
  const count = optionKeys.length;
  const [highlight, setHighlight] = useState({ list, index: -1 });
  const active = highlight.list === list ? highlight.index : -1;
  return {
    active,
    move: (step: 1 | -1) => {
      if (count === 0) return;
      const index = active < 0 ? (step === 1 ? 0 : count - 1) : (active + step + count) % count;
      setHighlight({ list, index });
    },
    reset: () => setHighlight({ list, index: -1 }),
  };
}

/**
 * For `onEscapeKeyDown` of a dialog or sheet holding a combobox. Radix handles Escape on the
 * document before the input sees it: without this, Escape meant to close the suggestions closes
 * the whole form, and what was entered is lost.
 */
export function keepOpenOnListboxEscape(event: KeyboardEvent) {
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    target.getAttribute('role') === 'combobox' &&
    target.getAttribute('aria-expanded') === 'true'
  ) {
    event.preventDefault();
  }
}
