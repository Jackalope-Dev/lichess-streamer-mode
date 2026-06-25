import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'Lichess Streamer Mode',
    // Keep <= 132 chars: Chrome Web Store enforces this on the manifest
    // description. The longer marketing copy lives in the store listing.
    description:
      'Hide every Lichess username while streaming. You become Streamer, your opponent Opponent — stop stream-sniping in one click.',
    permissions: ['storage'],
    // Action title shows in the toolbar tooltip.
    action: {
      default_title: 'Lichess Streamer Mode',
    },
    commands: {
      'toggle-streamer-mode': {
        suggested_key: {
          default: 'Ctrl+Shift+H',
          mac: 'Command+Shift+H',
        },
        description: 'Toggle Lichess Streamer Mode on/off',
      },
    },
    browser_specific_settings: {
      gecko: {
        id: 'lichess-streamer-mode@cadenmackenzie',
      },
    },
  },
});
