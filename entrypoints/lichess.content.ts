import { defineContentScript } from '#imports';
import { enabledItem } from '@/lib/state';
import { LichessMasker } from '@/lib/masker';

export default defineContentScript({
  matches: ['*://lichess.org/*', '*://*.lichess.org/*'],
  runAt: 'document_start',
  main() {
    const masker = new LichessMasker();

    enabledItem.getValue().then((enabled) => {
      if (enabled) masker.enable();
    });

    enabledItem.watch((enabled) => {
      if (enabled) masker.enable();
      else masker.disable();
    });
  },
});
