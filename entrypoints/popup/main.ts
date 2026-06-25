import { enabledItem } from '@/lib/state';

const toggle = document.getElementById('toggle') as HTMLButtonElement;
const stateLabel = document.getElementById('state-label') as HTMLElement;
const hint = document.getElementById('hint') as HTMLElement;

function render(enabled: boolean): void {
  toggle.setAttribute('aria-checked', String(enabled));
  toggle.classList.toggle('on', enabled);
  stateLabel.textContent = enabled ? 'On' : 'Off';
  hint.textContent = enabled
    ? 'Names are hidden. Safe to go live.'
    : 'Usernames are visible. Click to hide them on stream.';
}

async function init(): Promise<void> {
  render(await enabledItem.getValue());
}

toggle.addEventListener('click', async () => {
  const next = !(await enabledItem.getValue());
  await enabledItem.setValue(next);
  render(next);
});

// Keep the popup in sync if the hotkey flips it while open.
enabledItem.watch((enabled) => render(enabled));

init();
