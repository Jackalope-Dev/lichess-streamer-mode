// Functional test for the masker against realistic Lichess-shaped DOM.
// Run with:  node --experimental-strip-types scripts/test-masker.mjs
import { JSDOM } from 'jsdom';

const HTML = `<!doctype html><html><head></head><body>
  <!-- top bar dasher: button shows the name (text only); the Profile link in
       the dropdown carries the real /@/ username -->
  <div class="dasher">
    <button id="user_tag" class="toggle link">PenguinBlitz</button>
    <div id="dasher_app" class="dropdown">
      <a class="user-link online" href="/@/PenguinBlitz"><icon class="line"></icon>Profile</a>
    </div>
  </div>

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

  <!-- games in play: username is a PLAIN TEXT node, no href anywhere -->
  <a class="mini-game" href="/someGameId">
    <span class="mini-game__user"><span class="utitle" title="Grandmaster">GM</span>&nbsp;pozvonochek<span class="rating">3005</span></span>
  </a>

  <!-- correspondence/lobby seek table: span with data-href (not href) -->
  <table class="hooks__list"><tbody>
    <tr class="seek join"><td><span class="ulpt" data-href="/@/thedemon44">thedemon44</span></td><td>1908</td></tr>
    <tr class="seek join"><td><span class="" data-href="/@/c4_english">c4_english</span></td><td>1892</td></tr>
  </tbody></table>

  <!-- correspondence games in progress: now-playing widget; opponent name is
       a plain text node in .meta, followed by an indicator/time -->
  <div class="now-playing">
    <a class="standard" href="/60f6XI9GGilB">
      <span class="mini-board"></span>
      <span class="meta">Comrade001<span class="indicator"><time class="set" datetime="1782590769049">in 43 hours</time></span></span>
    </a>
  </div>
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
check('user_tag cached real name is real, not alias', attr('#user_tag', 'data-sm-real'), 'PenguinBlitz');
check('dasher Profile label untouched', text('#dasher_app a.user-link'), 'Profile');
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

// --- games-in-play mini-game (plain-text username, no href) ---
const re_player = /^Player \d+$/;
check('mini-game name masked', re_player.test(visibleText('.mini-game__user')), true);
check('mini-game GM badge hidden', document.querySelector('.mini-game__user .utitle').style.display, 'none');
check('mini-game rating preserved', text('.mini-game__user .rating'), '3005');

// --- correspondence/lobby seek table (span[data-href]) ---
const seek1 = document.querySelector('.hooks__list tr:nth-child(1) td span');
const seek2 = document.querySelector('.hooks__list tr:nth-child(2) td span');
check('seek row 1 name masked', re_player.test(seek1.textContent.trim()), true);
check('seek row 1 data-href scrubbed', seek1.getAttribute('data-href'), null);
check('seek row 2 (classless) name masked', re_player.test(seek2.textContent.trim()), true);

// --- now-playing widget (plain-text name + indicator/time) ---
const meta = document.querySelector('.now-playing .meta');
check('now-playing name masked', /Player \d+/.test(meta.textContent), true);
check('now-playing real name hidden', meta.textContent.includes('Comrade001'), false);
check('now-playing time preserved', meta.querySelector('time').textContent, 'in 43 hours');

// --- live update: a new chat message from the opponent stays consistent ---
const newMsg = document.createElement('li');
newMsg.className = 'mchat__message';
newMsg.innerHTML = '<span class="user-link" data-username="DarkKnight99">DarkKnight99</span> rematch?';
document.querySelector('.mchat__messages').appendChild(newMsg);
await new Promise((r) => setTimeout(r, 50)); // let MutationObserver fire
check('live chat message masked + consistent', newMsg.textContent.replace(/\s+/g, ' ').trim(), 'Opponent rematch?');

// --- board re-render reversion: Lichess (Snabbdom) patches the name text
//     node back to the real name in place. We must re-mask it, with no
//     feedback loop corrupting other elements. ---
const oppLink = document.querySelector('.ruser-top a');
const oppTextNode = [...oppLink.childNodes].find(
  (n) => n.nodeType === 3 && n.nodeValue.includes('Opponent'),
);
oppTextNode.nodeValue = 'DarkKnight99'; // simulate the revert
await new Promise((r) => setTimeout(r, 50));
check('board name re-masked after revert', visibleText('.ruser-top a'), 'Opponent');
check('no feedback-loop corruption of streamer tag', text('#user_tag'), 'Streamer');

// --- re-render via text-node REPLACEMENT (not in-place): Lichess removes the
//     name text node and inserts a fresh one with the real name. We must catch
//     the added text node and re-mask its host. ---
const tagNode = document.getElementById('user_tag');
[...tagNode.childNodes].forEach((n) => n.nodeType === 3 && n.remove());
tagNode.appendChild(document.createTextNode('PenguinBlitz')); // fresh real-name node
await new Promise((r) => setTimeout(r, 50));
check('streamer tag re-masked after text-node replacement', text('#user_tag'), 'Streamer');

// --- disable restores everything ---
masker.disable();
check('disable restores streamer tag', text('#user_tag'), 'PenguinBlitz');
check('disable restores opponent name', text('.ruser-top a').replace(/\s+/g, ' ').trim(), 'GMDarkKnight99');
check('disable restores href', attr('.ruser-top a', 'href'), '/@/DarkKnight99');
check('disable restores GM badge', document.querySelector('.ruser-top .utitle').style.display, '');
const mg = document.querySelector('.mini-game__user');
check(
  'disable restores mini-game name',
  mg.textContent.includes('pozvonochek') && !mg.textContent.includes('Player'),
  true,
);
check('disable restores mini-game GM badge', mg.querySelector('.utitle').style.display, '');
check('disable restores seek data-href', attr('.hooks__list tr:nth-child(1) td span', 'data-href'), '/@/thedemon44');
check('disable restores seek name', text('.hooks__list tr:nth-child(1) td span'), 'thedemon44');
check('disable restores now-playing name', document.querySelector('.now-playing .meta').textContent.includes('Comrade001'), true);

// --- corruption resistance: simulate a stale session that left the #user_tag
//     button showing an alias. A fresh enable must NOT bake "Streamer" in as
//     the real name — it should detect the streamer from the dasher Profile
//     link (which still has the real /@/ href) and leave the button's bad
//     cached value out. ---
document.getElementById('user_tag').textContent = 'Streamer'; // leftover alias
const masker2 = new LichessMasker();
masker2.enable();
check(
  'corruption: user_tag NOT re-derived as the alias',
  attr('#user_tag', 'data-sm-real') === 'Streamer',
  false,
);
check(
  'corruption: streamer still detected from Profile link',
  attr('#dasher_app a.user-link', 'data-sm-real'),
  'PenguinBlitz',
);
masker2.disable();

console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
