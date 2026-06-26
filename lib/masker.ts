/**
 * LichessMasker — replaces every visible username on lichess.org with a
 * privacy-preserving alias while Streamer Mode is enabled.
 *
 * Aliasing rules:
 *   - The logged-in user (the streamer)      -> "Streamer"
 *   - The opponent in the active game         -> "Opponent"
 *   - Everyone else (spectators, lobby, etc.) -> "Player 1", "Player 2", ...
 *
 * Design notes (why it's built this way):
 *
 *   Lichess is a single-page app whose game board, lobby and "games in play"
 *   widgets are driven by a virtual DOM (Snabbdom). It re-renders frequently
 *   and will happily revert a text node we edited back to the real username.
 *   So masking must be IDEMPOTENT and RE-APPLIABLE: we re-run on every relevant
 *   mutation (including in-place characterData changes) and re-derive the real
 *   name from a STABLE source we control (the `data-sm-real` attribute), never
 *   from the now-aliased text. That makes re-masking a no-op once a node is
 *   already aliased, which both fixes reverts and prevents a feedback loop.
 *
 *   Everything is fully reversible: enabling records each element's original
 *   values and disabling restores them live, with no page reload.
 */

const DONE_ATTR = 'data-sm-done'; // "masked at least once" (drives no-flash blur)
const REAL_ATTR = 'data-sm-real'; // cached real username (stable identity)
const ROOT_CLASS = 'sm-active';
const STYLE_ID = 'sm-style';

// Attributes that can leak the real identity and must be neutralised. Order
// matters for `data-username` (we read it before overwriting).
const SCRUB_ATTRS = ['href', 'data-href', 'title', 'data-username'] as const;

// Elements that may carry a username. Covers: profile links (`/@/`), the
// generic user-link spans, seek/lobby rows that use `data-href` on a bare
// span, the "games in play" mini-boards (plain-text name), `[data-username]`
// chat rows, and the logged-in user's own tag.
// Containers whose username is a bare text node (no link/attribute): the
// "games in play" mini-boards and the "now playing" correspondence widget.
const TEXT_NAME_SELECTOR = '.mini-game__user, .now-playing .meta';

const CANDIDATE_SELECTOR = [
  'a.user-link',
  'span.user-link',
  '.user-link',
  'a[href^="/@/"]',
  '[data-href^="/@/"]',
  '.mini-game__user',
  '.now-playing .meta',
  '[data-username]',
  '#user_tag',
].join(',');

// CSS injected while active. Blurs any not-yet-processed username so a real
// name can never be readable on stream, even for a frame, and blurs profile
// photos in the usual identity-revealing areas.
const ACTIVE_CSS = `
html.${ROOT_CLASS} a.user-link:not([${DONE_ATTR}]),
html.${ROOT_CLASS} span.user-link:not([${DONE_ATTR}]),
html.${ROOT_CLASS} .user-link:not([${DONE_ATTR}]),
html.${ROOT_CLASS} a[href^="/@/"]:not([${DONE_ATTR}]),
html.${ROOT_CLASS} [data-href^="/@/"]:not([${DONE_ATTR}]),
html.${ROOT_CLASS} .mini-game__user:not([${DONE_ATTR}]),
html.${ROOT_CLASS} .now-playing .meta:not([${DONE_ATTR}]),
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

// Child elements inside a username container that are NOT part of the name
// (title badge, rating, status line, time/indicator) — stripped when reading
// a plain-text name.
const NON_NAME_SELECTOR =
  '.utitle, .rating, .line, .checkmark, signal, rating, .indicator, time';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface Record_ {
  real: string;
  alias: string;
  /** original attribute values (null = was absent) */
  attrs: Partial<Record<(typeof SCRUB_ATTRS)[number], string | null>>;
}

export class LichessMasker {
  private active = false;

  /** lowercase real name -> alias */
  private aliases = new Map<string, string>();
  private streamerKey: string | null = null;
  private opponentKey: string | null = null;
  private playerCounter = 0;

  /** per-element masking record, for idempotent re-masking + restore */
  private records = new Map<HTMLElement, Record_>();

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
    // We observe characterData too: when Snabbdom reverts a name we edited, it
    // patches the text node in place. Re-masking is idempotent (real name comes
    // from the stable data-sm-real attribute), so this cannot loop.
    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });

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

    for (const [el, rec] of this.records) {
      try {
        // reverse the text: alias -> real
        this.replaceText(el, rec.alias, rec.real);
        // restore scrubbed attributes
        for (const attr of SCRUB_ATTRS) {
          const orig = rec.attrs[attr];
          if (orig === undefined) continue;
          if (orig === null) el.removeAttribute(attr);
          else el.setAttribute(attr, orig);
        }
        // un-hide title badges
        el.querySelectorAll<HTMLElement>('.utitle').forEach((t) => {
          t.style.display = '';
        });
        el.removeAttribute(REAL_ATTR);
        el.removeAttribute(DONE_ATTR);
      } catch {
        /* element may be detached — ignore */
      }
    }

    this.records.clear();
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
    const name = this.realNameOf(tag);
    if (name) this.streamerKey = name.toLowerCase();
  }

  private detectOpponent(): void {
    if (this.opponentKey || !this.streamerKey) return;
    const slots = document.querySelectorAll('.ruser-top, .ruser-bottom');
    const names: string[] = [];
    slots.forEach((slot) => {
      const link = slot.querySelector<HTMLElement>(
        'a[href^="/@/"], [data-href^="/@/"], .user-link, [data-username]',
      );
      const n = link && this.realNameOf(link);
      if (n) names.push(n.toLowerCase());
    });
    if (names.length >= 2 && names.includes(this.streamerKey)) {
      const opp = names.find((n) => n !== this.streamerKey);
      if (opp) this.opponentKey = opp;
    }
  }

  /**
   * The real username for an element. Prefers the cached `data-sm-real` (stable
   * across re-renders and after we scrub other attributes); otherwise derives
   * it fresh from the still-pristine DOM.
   */
  private realNameOf(el: HTMLElement): string | null {
    const cached = el.getAttribute(REAL_ATTR);
    if (cached) return cached;
    return this.deriveReal(el);
  }

  /** Derive the real username from pristine DOM (call before scrubbing). */
  private deriveReal(el: HTMLElement): string | null {
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

    // Plain-text username (mini-board / now-playing): the text with the title
    // badge, rating, time and status markers stripped out.
    if (el.matches(TEXT_NAME_SELECTOR)) {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll(NON_NAME_SELECTOR).forEach((n) => n.remove());
      const name = (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (name) return name;
    }

    return null;
  }

  // --- masking -------------------------------------------------------------

  private sweep(root: ParentNode): void {
    root.querySelectorAll<HTMLElement>(CANDIDATE_SELECTOR).forEach((el) =>
      this.maskElement(el),
    );
  }

  private maskElement(el: HTMLElement): void {
    if (!this.active) return;

    let rec = this.records.get(el);
    if (!rec) {
      const real = this.deriveReal(el);
      if (!real) return;
      const attrs: Record_['attrs'] = {};
      for (const attr of SCRUB_ATTRS) attrs[attr] = el.getAttribute(attr);
      rec = { real, alias: this.aliasFor(real), attrs };
      this.records.set(el, rec);
      el.setAttribute(REAL_ATTR, real);
    }

    const { real, alias } = rec;

    // 1. Replace the real name with the alias in every descendant text node.
    //    Idempotent: once the text is the alias, nothing matches.
    this.replaceText(el, real, alias);

    // 2. Neutralise identity-leaking attributes (idempotent).
    for (const attr of SCRUB_ATTRS) {
      if (attr === 'data-username') {
        if (el.getAttribute(attr) !== null && el.getAttribute(attr) !== alias) {
          el.setAttribute(attr, alias);
        }
      } else if (el.hasAttribute(attr)) {
        el.removeAttribute(attr);
      }
    }

    // 3. Hide title badges (GM/IM/FM…) — strong identity hints (idempotent).
    el.querySelectorAll<HTMLElement>('.utitle').forEach((t) => {
      if (t.style.display !== 'none') t.style.display = 'none';
    });

    if (!el.hasAttribute(DONE_ATTR)) el.setAttribute(DONE_ATTR, '');
  }

  /** Replace `from` with `to` in every descendant text node of `el`. */
  private replaceText(el: HTMLElement, from: string, to: string): void {
    const re = new RegExp(escapeRegExp(from), 'gi');
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const value = node.nodeValue;
      if (!value) continue;
      re.lastIndex = 0;
      if (re.test(value)) {
        re.lastIndex = 0;
        node.nodeValue = value.replace(re, to);
      }
    }
  }

  // --- live updates --------------------------------------------------------

  private onMutations(mutations: MutationRecord[]): void {
    if (!this.active) return;

    // SPA navigation: reset per-page identity (keep the streamer) and prune
    // records for elements that have left the DOM.
    if (location.pathname !== this.lastPath) {
      this.lastPath = location.pathname;
      this.aliases.clear();
      this.opponentKey = null;
      this.playerCounter = 0;
      for (const el of this.records.keys()) {
        if (!el.isConnected) this.records.delete(el);
      }
    }

    this.detectStreamer();
    this.detectOpponent();

    for (const m of mutations) {
      if (m.type === 'characterData') {
        const host = m.target.parentElement?.closest<HTMLElement>(CANDIDATE_SELECTOR);
        if (host) this.maskElement(host);
        continue;
      }
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
