// Functional test for the masker against realistic Lichess-shaped DOM.
// Run with:  node --experimental-strip-types scripts/test-masker.mjs
import { JSDOM } from 'jsdom';

const HTML = `<!doctype html><html><head></head><body>
  <!-- top bar: the logged-in user (the streamer) -->
  <div id="user_tag" class="toggle link">PenguinBlitz</div>

  <!-- a game: streamer is bottom, opponent is top -->
  <div class="ruser ruser-top">
    <a class="user-link ulpt online" href="/@/DarkKnight99">
      <span class="utitle">GM</span>DarkKnight99
    </a>
    <rating>2541</rating>
  </div>
  <div class="ruser ruser-bottom">
    <a class="user-link" href="/@/PenguinBlitz">PenguinBlitz</a>
    <rating>1987</rating>
  </div>

  <!-- chat: uses data-username + text -->
  <div class="mchat">
    <div class="mchat__messages">
      <li class="mchat__message">
        <span class="user-link" data-username="DarkKnight99">DarkKnight99</span> good luck
      </li>
      <li class="mchat__message">
        <span class="user-link" data-username="PenguinBlitz">PenguinBlitz</span> u2
      </li>
      <li class="mchat__message">
        <span class="user-link" data-username="RandomSpectator">RandomSpectator</span> nice game
      </li>
    </div>
  </div>

  <!-- a lobby/leaderboard link to a fourth, unrelated user -->
  <a class="user-link" href="/@/SomeOtherGuy" title="SomeOtherGuy">SomeOtherGuy</a>
</body></html>`;

const dom = new JSDOM(HTML, { url: 'https://lichess.org/abcd1234efgh' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.NodeFilter = dom.window.NodeFilter;
globalThis.Node = dom.window.Node;
globalThis.MutationObserver = dom.window.MutationObserver;
Object.defineProperty(globalThis, 'location', {
  value: dom.window.location,
  configurable: true,
});

const { LichessMasker } = await import('../lib/masker.ts');

const masker = new LichessMasker();
masker.enable();

let failures = 0;
const text = (sel) => document.querySelector(sel)?.textContent?.trim();
const attr = (sel, a) => document.querySelector(sel)?.getAttribute(a);

function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${name}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
}

// visibleText ignores display:none nodes (e.g. hidden GM/IM title badges),
// matching what actually renders on screen.
const visibleText = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return undefined;
  let out = '';
  el.querySelectorAll('*').forEach((c) => {
    if (c.style.display === 'none') c.setAttribute('data-hidden', '1');
  });
  const walk = (node) => {
    if (node.nodeType === 3) out += node.nodeValue;
    else if (node.nodeType === 1 && node.getAttribute('data-hidden') !== '1')
      node.childNodes.forEach(walk);
  };
  el.childNodes.forEach(walk);
  return out.replace(/\s+/g, ' ').trim();
};

// --- enabled assertions ---
check('streamer tag relabelled', text('#user_tag'), 'Streamer');
check('opponent visible name (GM badge hidden)', visibleText('.ruser-top a'), 'Opponent');
check('streamer (bottom player) relabelled', text('.ruser-bottom a'), 'Streamer');
check('opponent href scrubbed', attr('.ruser-top a', 'href'), null);
check('GM title badge hidden', document.querySelector('.ruser-top .utitle').style.display, 'none');

const chatRows = [...document.querySelectorAll('.mchat__message')].map((li) =>
  li.textContent.replace(/\s+/g, ' ').trim(),
);
check('chat: opponent consistent', chatRows[0], 'Opponent good luck');
check('chat: streamer consistent', chatRows[1], 'Streamer u2');
check('chat: spectator -> Player N', chatRows[2], 'Player 1 nice game');
check('chat data-username scrubbed (opponent)', attr('.mchat__message .user-link', 'data-username'), 'Opponent');

check('unrelated user href scrubbed (selector misses)', text('a[href="/@/SomeOtherGuy"]'), undefined);
const others = [...document.querySelectorAll('.user-link')].map((e) => e.textContent.trim());
check('lobby user got a Player alias', others.includes('Player 2'), true);
check('rating preserved', text('.ruser-top rating'), '2541');

// --- live update: a new chat message from the opponent stays consistent ---
const newMsg = document.createElement('li');
newMsg.className = 'mchat__message';
newMsg.innerHTML = '<span class="user-link" data-username="DarkKnight99">DarkKnight99</span> rematch?';
document.querySelector('.mchat__messages').appendChild(newMsg);
await new Promise((r) => setTimeout(r, 50)); // let MutationObserver fire
check('live chat message masked + consistent', newMsg.textContent.replace(/\s+/g, ' ').trim(), 'Opponent rematch?');

// --- disable restores everything ---
masker.disable();
check('disable restores streamer tag', text('#user_tag'), 'PenguinBlitz');
check('disable restores opponent name', text('.ruser-top a').replace(/\s+/g, ' ').trim(), 'GMDarkKnight99');
check('disable restores href', attr('.ruser-top a', 'href'), '/@/DarkKnight99');
check('disable restores GM badge', document.querySelector('.ruser-top .utitle').style.display, '');

console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
