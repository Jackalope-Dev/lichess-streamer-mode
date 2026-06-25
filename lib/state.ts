import { storage } from '#imports';

/**
 * Single source of truth for whether Streamer Mode is enabled.
 * Stored in local storage so it persists per-browser-profile and is
 * shared between the popup, background (hotkey), and content script.
 */
export const enabledItem = storage.defineItem<boolean>(
  'local:streamerMode.enabled',
  { fallback: false },
);
