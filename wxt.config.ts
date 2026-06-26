import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'Streamer Mode for Lichess',
    // Keep <= 132 chars: Chrome Web Store enforces this on the manifest
    // description. The longer marketing copy lives in the store listing.
    description:
      'Hide every Lichess username while streaming. You become Streamer, your opponent Opponent — stop stream-sniping in one click.',
    permissions: ['storage'],
    // Action title shows in the toolbar tooltip.
    action: {
      default_title: 'Streamer Mode for Lichess',
    },
    commands: {
      'toggle-streamer-mode': {
        // Alt+Shift+S: cross-browser safe. We avoid Ctrl+Shift+H because that
        // is Firefox's built-in Library/History shortcut and never reaches us.
        suggested_key: {
          default: 'Alt+Shift+S',
          mac: 'Alt+Shift+S',
        },
        description: 'Toggle Streamer Mode for Lichess on/off',
      },
    },
    browser_specific_settings: {
      gecko: {
        id: 'lichess-streamer-mode@cadenmackenzie',
      },
    },
  },
});
