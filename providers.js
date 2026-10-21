// ============================================================
// providers.js — one adapter per public API, all returning the same Track shape:
// { id, provider, type, title, artist, license, licenseUrl, page, thumb,
//   sources: [url,...] | null, resolve?: () => Promise<url[]>, downloadUrl? }
// `sources` is an ORDERED fallback list: the player tries each until one plays.
// ============================================================
import { CONFIG } from "./config.js";

const LANG_NAMES = { en:"English", es:"Spanish", fr:"French", de:"German", hi:"Hindi", bn:"Bengali", ja:"Japanese" };
const first = v => [].concat(v ?? "")[0];
const stripHtml = h => (h || "").replace(/<[^>]*>/g, "").trim();

// Fetch JSON with a timeout so one dead API can't freeze the UI.
async function getJSON(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), CONFIG.TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } finally { clearTimeout(timer); }
}

// "https://creativecommons.org/licenses/by-sa/4.0/" -> "CC BY-SA 4.0"
function licenseLabel(url = "") {
  url = first(url);
  const m = url.match(/licenses\/([a-z-]+)\/([\d.]+)/i);
  if (m) return `CC ${m[1].toUpperCase()} ${m[2]}`;
  return /publicdomain|zero/i.test(url) ? "Public Domain / CC0" : "See source";
}

// ---------- Internet Archive (no key, CORS enabled) ----------
const archive = {
  name: "Internet Archive",
  async search({ q, type, genre, lang, page }) {
    const media = type === "video" ? "movies" : "audio";
    const query = [
      q && `(${q})`, genre && `subject:(${genre})`, lang && `language:(${LANG_NAMES[lang]})`,
      `mediatype:${media}`,
      "(licenseurl:*creativecommons.org* OR licenseurl:*publicdomain*)", // legal reuse only
    ].filter(Boolean).join(" AND ");
    const u = new URL("https://archive.org/advancedsearch.php");
    u.searchParams.set("q", query);
    ["identifier", "title", "creator", "licenseurl"].forEach(f => u.searchParams.append("fl[]", f));
    u.searchParams.set("sort[]", "downloads desc");
    u.searchParams.set("rows", CONFIG.PAGE_SIZE);
    u.searchParams.set("page", page);
    u.searchParams.set("output", "json");
    const d = await getJSON(u);
    return d.response.docs.map(x => ({
      id: "ia:" + x.identifier, provider: "Internet Archive", type,
      title: x.title, artist: [].concat(x.creator || "Unknown").join(", "),
      license: licenseLabel(x.licenseurl), licenseUrl: first(x.licenseurl),
      page: "https://archive.org/details/" + x.identifier,
      thumb: "https://archive.org/services/img/" + x.identifier,
      sources: null,                                   // resolved lazily on Play (1 extra call)
      resolve: () => archiveFiles(x.identifier, type),
    }));
  },
};

// Pick one file per playable format; extra formats become fallbacks.
async function archiveFiles(id, type) {
  const prefs = type === "video" ? ["h.264", "MPEG4", "512Kb MPEG4", "Ogg Video"]
                                 : ["VBR MP3", "MP3", "128Kbps MP3", "Ogg Vorbis"];
  const meta = await getJSON("https://archive.org/metadata/" + id);
  return prefs
    .map(fmt => (meta.files || []).find(f => f.format === fmt))
    .filter(Boolean)
    .map(f => `https://archive.org/download/${id}/${f.name.split("/").map(encodeURIComponent).join("/")}`);
}

// ---------- Wikimedia Commons (no key, CORS via origin=*) ----------
const commons = {
  name: "Wikimedia Commons",
  async search({ q, type, genre, page }) {
    const u = new URL("https://commons.wikimedia.org/w/api.php");
    Object.entries({
      action: "query", format: "json", origin: "*", generator: "search",
      gsrsearch: `filetype:${type} ${q} ${genre || ""}`.trim(), gsrnamespace: 6,
      gsrlimit: CONFIG.PAGE_SIZE, gsroffset: (page - 1) * CONFIG.PAGE_SIZE,
      prop: "imageinfo", iiprop: "url|extmetadata",
    }).forEach(([k, v]) => u.searchParams.set(k, v));
    const d = await getJSON(u);
    return Object.values(d.query?.pages || {}).map(p => {
      const i = p.imageinfo?.[0], md = i?.extmetadata || {};
      return {
        id: "wc:" + p.pageid, provider: "Wikimedia Commons", type,
        title: p.title.replace(/^File:/, "").replace(/\.\w+$/, "").replace(/_/g, " "),
        artist: stripHtml(md.Artist?.value) || "Unknown",
        license: md.LicenseShortName?.value || "See source", licenseUrl: md.LicenseUrl?.value,
        page: "https://commons.wikimedia.org/wiki/" + encodeURIComponent(p.title),
        thumb: "", sources: i ? [i.url] : [],
      };
    }).filter(t => t.sources.length && /^(CC|Public domain|PD|Attribution)/i.test(t.license));
  },
};

// ---------- Jamendo (free client_id, audio only) ----------
const jamendo = {
  name: "Jamendo",
  async search({ q, type, genre, lang, page }) {
    if (!CONFIG.JAMENDO_CLIENT_ID || type !== "audio") return [];
    const u = new URL("https://api.jamendo.com/v3.0/tracks/");
    Object.entries({
      client_id: CONFIG.JAMENDO_CLIENT_ID, format: "json", limit: CONFIG.PAGE_SIZE,
      offset: (page - 1) * CONFIG.PAGE_SIZE, search: q, tags: genre, lang,
      order: q ? "relevance" : "popularity_total",
    }).forEach(([k, v]) => v && u.searchParams.set(k, v));
    const d = await getJSON(u);
    return d.results.map(x => ({
      id: "jm:" + x.id, provider: "Jamendo", type: "audio",
      title: x.name, artist: x.artist_name,
      license: licenseLabel(x.license_ccurl), licenseUrl: x.license_ccurl,
      page: x.shareurl, thumb: x.image,
      sources: [x.audio, x.audiodownload].filter(Boolean),
      downloadUrl: x.audiodownload_allowed ? x.audiodownload : x.audio,
    }));
  },
};

const PROVIDERS = { archive, commons, jamendo };

// Query every enabled source in parallel. A failing source is reported, never fatal.
export async function searchAll(params) {
  const active = Object.entries(PROVIDERS).filter(([k]) => CONFIG.PROVIDERS[k]).map(([, p]) => p);
  const settled = await Promise.allSettled(active.map(p => p.search(params)));
  const lists = [], failed = [];
  settled.forEach((r, i) => r.status === "fulfilled" ? lists.push(r.value) : failed.push(active[i].name));
  const tracks = []; // round-robin so no single source dominates the list
  for (let i = 0; i < Math.max(0, ...lists.map(l => l.length)); i++) lists.forEach(l => l[i] && tracks.push(l[i]));
  return { tracks, failed };
}

// Resolve (and cache) the playable URLs for a track.
export async function resolveSources(track) {
  if (!track.sources) track.sources = await track.resolve();
  return track.sources;
}
