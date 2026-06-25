import { defineBackground, browser } from '#imports';
import { enabledItem } from '@/lib/state';

export default defineBackground(() => {
  // Keyboard shortcut (Ctrl/Cmd+Shift+H) flips the toggle so a streamer can
  // hide/show names without leaving their game.
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'toggle-streamer-mode') return;
    const current = await enabledItem.getValue();
    await enabledItem.setValue(!current);
  });
});
