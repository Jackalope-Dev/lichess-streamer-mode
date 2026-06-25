/**
 * LichessMasker — replaces every visible username on lichess.org with a
 * privacy-preserving alias while Streamer Mode is enabled.
 *
 * Aliasing rules:
 *   - The logged-in user (the streamer)      -> "Streamer"
 *   - The opponent in the active game         -> "Opponent"
 *   - Everyone else (spectators, lobby, etc.) -> "Player 1", "Player 2", ...
 *
 * Everything is fully reversible: enabling records the original DOM values
 * and disabling restores them live, with no page reload.
 */

const DONE_ATTR = 'data-sm-done';
const ROOT_CLASS = 'sm-active';
const STYLE_ID = 'sm-style';

// Attributes that can leak the real identity and must be neutralised.
const SCRUB_ATTRS = ['href', 'data-href', 'title', 'data-username'] as const;

// CSS injected while active. It blurs any not-yet-processed username so a
// real name can never be readable on stream, even for a single frame, and
// blurs profile photos in the usual identity-revealing areas.
const ACTIVE_CSS = `
html.${ROOT_CLASS} a.user-link:not([${DONE_ATTR}]),
html.${ROOT_CLASS} span.user-link:not([${DONE_ATTR}]),
html.${ROOT_CLASS} .user-link:not([${DONE_ATTR}]),
html.${ROOT_CLASS} a[href^="/@/"]:not([${DONE_ATTR}]),
html.${ROOT_CLASS} [data-username]:not([${DONE_ATTR}]),
html.${ROOT_CLASS} #user_tag:not([${DONE_ATTR}]) {
  filter: blur(7px) !important;
}
html.${ROOT_CLASS} .ruser img,
html.${ROOT_CLASS} .mchat img,
html.${ROOT_CLASS} .user-show .name img,
html.${ROOT_CLASS} .upt__info img {
  filter: blur(12px) !important;
}
`;

// Elements that may carry a username.
const CANDIDATE_SELECTOR = [
  'a.user-link',
  'span.user-link',
  '.user-link',
  'a[href^="/@/"]',
  '[data-username]',
  '#user_tag',
].join(',');

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class LichessMasker {
  private active = false;

  /** lowercase real name -> alias */
  private aliases = new Map<string, string>();
  private streamerKey: string | null = null;
  private opponentKey: string | null = null;
  private playerCounter = 0;

  /** Undo closures recorded while masking. */
  private restorers: Array<() => void> = [];

  private observer: MutationObserver | null = null;
  private lastPath = '';

  enable(): void {
    if (this.active) return;
    this.active = true;
    this.lastPath = location.pathname;

    document.documentElement.classList.add(ROOT_CLASS);
    this.injectStyle();

    this.detectStreamer();
    this.detectOpponent();
    this.sweep(document);

    this.observer = new MutationObserver((mutations) => this.onMutations(mutations));
    // childList + subtree only. We deliberately do NOT observe characterData:
    // our own text edits would otherwise queue records that re-process masked
    // nodes using their alias as the "real" name, corrupting them. Lichess
    // surfaces new usernames by inserting new nodes, which childList catches.
    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    // Catch the rest of the page if we started at document_start.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.sweep(document), {
        once: true,
      });
    }
  }

  disable(): void {
    if (!this.active) return;
    this.active = false;

    this.observer?.disconnect();
    this.observer = null;

    // Run restorers in reverse so nested edits unwind cleanly.
    for (let i = this.restorers.length - 1; i >= 0; i--) {
      try {
        this.restorers[i]();
      } catch {
        /* element may have been removed from the DOM — ignore */
      }
    }
    this.restorers = [];

    this.aliases.clear();
    this.streamerKey = null;
    this.opponentKey = null;
    this.playerCounter = 0;

    document.documentElement.classList.remove(ROOT_CLASS);
    document.getElementById(STYLE_ID)?.remove();
  }

  // --- alias resolution ----------------------------------------------------

  private aliasFor(real: string): string {
    const key = real.toLowerCase();
    const existing = this.aliases.get(key);
    if (existing) return existing;

    let alias: string;
    if (key === this.streamerKey) alias = 'Streamer';
    else if (key === this.opponentKey) alias = 'Opponent';
    else alias = `Player ${++this.playerCounter}`;

    this.aliases.set(key, alias);
    return alias;
  }

  // --- identity detection --------------------------------------------------

  private detectStreamer(): void {
    if (this.streamerKey) return;
    const tag = document.getElementById('user_tag');
    if (!tag) return;
    const name = this.extractUsername(tag);
    if (name) this.streamerKey = name.toLowerCase();
  }

  private detectOpponent(): void {
    if (this.opponentKey || !this.streamerKey) return;
    const slots = document.querySelectorAll('.ruser-top, .ruser-bottom');
    const names: string[] = [];
    slots.forEach((slot) => {
      const link = slot.querySelector<HTMLElement>(
        'a[href^="/@/"], .user-link, [data-username]',
      );
      const n = link && this.extractUsername(link);
      if (n) names.push(n.toLowerCase());
    });
    if (names.length >= 2 && names.includes(this.streamerKey)) {
      const opp = names.find((n) => n !== this.streamerKey);
      if (opp) this.opponentKey = opp;
    }
  }

  /** Pull the real username out of an element, most reliable source first. */
  private extractUsername(el: HTMLElement): string | null {
    const dataName = el.getAttribute('data-username');
    if (dataName) return dataName.trim();

    const href = el.getAttribute('href') ?? el.getAttribute('data-href');
    if (href) {
      const m = href.match(/\/@\/([\w-]+)/);
      if (m) return m[1];
    }

    if (el.id === 'user_tag') {
      const m = (el.textContent ?? '').match(/[\w][\w-]{1,28}/);
      if (m) return m[0];
    }

    return null;
  }

  // --- masking -------------------------------------------------------------

  private sweep(root: ParentNode): void {
    const nodes = root.querySelectorAll<HTMLElement>(CANDIDATE_SELECTOR);
    nodes.forEach((el) => this.maskElement(el));
  }

  private maskElement(el: HTMLElement): void {
    if (!this.active || el.hasAttribute(DONE_ATTR)) return;

    const real = this.extractUsername(el);
    if (!real) return;

    const alias = this.aliasFor(real);
    const undo: Array<() => void> = [];

    // 1. Replace the name inside every descendant text node.
    const re = new RegExp(escapeRegExp(real), 'gi');
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let textNode: Node | null;
    while ((textNode = walker.nextNode())) {
      const value = textNode.nodeValue;
      if (value && re.test(value)) {
        re.lastIndex = 0;
        const original = value;
        const node = textNode;
        node.nodeValue = value.replace(re, alias);
        undo.push(() => {
          node.nodeValue = original;
        });
      }
    }

    // 2. Neutralise identity-leaking attributes.
    for (const attr of SCRUB_ATTRS) {
      if (!el.hasAttribute(attr)) continue;
      const original = el.getAttribute(attr)!;
      if (attr === 'data-username') {
        el.setAttribute(attr, alias);
        undo.push(() => el.setAttribute(attr, original));
      } else {
        el.removeAttribute(attr);
        undo.push(() => el.setAttribute(attr, original));
      }
    }

    // 3. Hide title badges (GM/IM/FM…) — strong identity hints.
    el.querySelectorAll<HTMLElement>('.utitle').forEach((t) => {
      const prev = t.style.display;
      t.style.display = 'none';
      undo.push(() => {
        t.style.display = prev;
      });
    });

    el.setAttribute(DONE_ATTR, '');
    undo.push(() => el.removeAttribute(DONE_ATTR));

    this.restorers.push(() => undo.forEach((fn) => fn()));
  }

  // --- live updates --------------------------------------------------------

  private onMutations(mutations: MutationRecord[]): void {
    if (!this.active) return;

    // SPA navigation: reset per-page identity (keep the streamer) and re-detect.
    if (location.pathname !== this.lastPath) {
      this.lastPath = location.pathname;
      this.aliases.clear();
      this.opponentKey = null;
      this.playerCounter = 0;
    }

    this.detectStreamer();
    this.detectOpponent();

    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const el = node as HTMLElement;
        if (el.matches?.(CANDIDATE_SELECTOR)) this.maskElement(el);
        this.sweep(el);
      });
    }
  }

  private injectStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = ACTIVE_CSS;
    (document.head ?? document.documentElement).appendChild(style);
  }
}
