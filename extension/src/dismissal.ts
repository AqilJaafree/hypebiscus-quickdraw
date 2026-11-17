// Remembers what the user dismissed so the popup doesn't come straight back.
//
// - Selection: after a dismiss, the same still-highlighted selection must not
//   reopen the popup. Any change to the selection (collapse, new range,
//   re-selecting the same text) or a fresh select gesture re-arms it.
// - Passive (scroll/mutation) detection: a dismissed address stays quiet for
//   the life of the page. Only an explicit selection shows it again.
export class DismissGuard {
  private suppressed: { address: string; selectionText: string } | null = null;
  private dismissed = new Set<string>();

  dismiss(address: string, selectionText: string): void {
    this.dismissed.add(address);
    this.suppressed = selectionText.includes(address) ? { address, selectionText } : null;
  }

  /** Call on every `selectionchange` with the current selection text. */
  selectionChanged(selectionText: string): void {
    if (this.suppressed && selectionText !== this.suppressed.selectionText) this.suppressed = null;
  }

  /** The user made a fresh selection gesture (drag, double-click, shift-select). */
  rearm(): void {
    this.suppressed = null;
  }

  allowSelection(address: string, selectionText: string): boolean {
    return !(this.suppressed
      && this.suppressed.address === address
      && this.suppressed.selectionText === selectionText);
  }

  allowPassive(address: string): boolean {
    return !this.dismissed.has(address);
  }
}
