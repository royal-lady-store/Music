// ============================================================
// config.js — the only file you normally need to edit.
// ============================================================
export const CONFIG = {
  // Optional. Free key from https://devportal.jamendo.com (Jamendo = CC-licensed music).
  // Leave "" to skip Jamendo; the other sources work with no key at all.
  JAMENDO_CLIENT_ID: "",
  PAGE_SIZE: 20,          // results requested per source, per page
  TIMEOUT_MS: 8000,       // a slow source is dropped after this, never blocks the others
  // Switch any source off here.
  PROVIDERS: { archive: true, commons: true, jamendo: true },
};
