// ============================================================
// app.js — UI wiring: search, results list, custom player, download.
// ============================================================
import { searchAll, resolveSources } from "./providers.js";

const $ = id => document.getElementById(id);
const media = $("media");                 // one <video> element plays both audio and video
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const fmt = s => isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00";

let page = 1, current = null, sources = [], idx = 0;

// ---------- Search ----------
async function runSearch(append = false) {
  const params = { q: $("q").value.trim(), type: $("type").value, genre: $("genre").value, lang: $("lang").value, page };
  if (!append) $("results").innerHTML = "";
  $("notice").textContent = "Searching…";
  $("more").classList.add("hidden");
  const { tracks, failed } = await searchAll(params);
  tracks.forEach(renderRow);
  $("notice").textContent =
    (tracks.length || append ? "" : "No results. Try a broader search or remove a filter.") +
    (failed.length ? ` Couldn't reach: ${failed.join(", ")}. Showing the other sources.` : "");
  $("more").classList.toggle("hidden", !tracks.length);
}

function renderRow(t) {
  const li = document.createElement("li");
  li.className = "flex items-center gap-4 py-3 border-b border-[#c5d0c9]";
  li.innerHTML = `
    <img src="${esc(t.thumb)}" alt="" loading="lazy" class="w-14 h-14 object-cover bg-[#c5d0c9] shrink-0" onerror="this.style.visibility='hidden'">
    <div class="min-w-0 flex-1">
      <p class="font-semibold truncate">${esc(t.title)}</p>
      <p class="text-sm text-[#52625c] truncate">${esc(t.artist)} (${esc(t.provider)})</p>
    </div>
    <a href="${esc(t.licenseUrl || t.page)}" target="_blank" rel="noopener" class="text-xs underline whitespace-nowrap">${esc(t.license)}</a>
    <button data-act="play" class="px-4 py-2 bg-[#1f7a6b] text-white font-semibold hover:bg-[#17594f]">Play</button>
    <button data-act="save" class="px-3 py-2 border border-[#17212b] font-semibold hover:bg-white whitespace-nowrap"></button>`;
  li.querySelector("[data-act=play]").onclick = () => play(t);
  const save = li.querySelector("[data-act=save]");
  const label = () => save.textContent = isSaved(t) ? "Remove" : "Save offline";
  label();
  save.onclick = async () => {
    save.disabled = true;
    try { isSaved(t) ? await removeOffline(t) : await saveOffline(t); }
    catch { $("notice").textContent = "Couldn't save this one: its host blocks offline copies. Try Download instead."; }
    save.disabled = false; label();
  };
  $("results").appendChild(li);
}

// ---------- Playback with automatic fallback ----------
async function play(track) {
  current = track;
  $("title").textContent = track.title;
  $("video-wrap").classList.toggle("hidden", track.type !== "video");
  setStatus("Loading…");
  // Saved copy first: it plays with no internet. Otherwise resolve online sources.
  sources = [];
  const url = lib().find(x => x.id === track.id)?.sources[0];
  const hit = url && await (await caches.open(CACHE)).match(url);
  if (hit) sources = [URL.createObjectURL(await hit.blob())];
  else { try { sources = await resolveSources(track); } catch { sources = []; } }
  load(0);
}

// Try sources[i]; if it errors, the `error` handler moves to the next one.
function load(i) {
  if (i >= sources.length) return setStatus("This track can't be played right now. Try another result.", true);
  idx = i;
  media.src = sources[i];
  setStatus(`Playing from ${current.provider}` + (sources.length > 1 ? ` (source ${i + 1} of ${sources.length})` : ""));
  media.play().catch(() => {});             // autoplay may be blocked; user can press Play
}
media.onerror = () => current && load(idx + 1);

function setStatus(msg, isError) {
  $("status").textContent = msg;
  $("status").classList.toggle("text-red-700", !!isError);
}

// ---------- Player controls ----------
$("toggle").onclick = () => media.paused ? media.play() : media.pause();
media.onplay = () => $("toggle").textContent = "Pause";
media.onpause = () => $("toggle").textContent = "Play";
media.onloadedmetadata = () => { $("seek").max = media.duration || 0; };
media.ontimeupdate = () => { $("seek").value = media.currentTime; $("time").textContent = `${fmt(media.currentTime)} / ${fmt(media.duration)}`; };
$("seek").oninput = e => media.currentTime = e.target.value;
$("vol").oninput = e => media.volume = e.target.value;

// ---------- Download ----------
// Blob download works when the host allows CORS; otherwise open the file in a new tab.
$("dl").onclick = async () => {
  const url = current?.downloadUrl || sources[idx];
  if (!url) return;
  const ext = (url.split("?")[0].match(/\.(\w{2,4})$/) || [, "mp3"])[1];
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(await res.blob()), download: `${current.title}.${ext}` });
    a.click(); URL.revokeObjectURL(a.href);
  } catch { window.open(url, "_blank", "noopener"); }
};

// ---------- Offline library (Cache Storage holds the files, localStorage holds the list) ----------
const LIB_KEY = "omh-saved", CACHE = "omh-media";
const lib = () => { try { return JSON.parse(localStorage.getItem(LIB_KEY)) || []; } catch { return []; } };
const isSaved = t => lib().some(x => x.id === t.id);

async function saveOffline(t) {
  const url = t.downloadUrl || (await resolveSources(t))[0];
  const res = await fetch(url);                         // the host must allow CORS
  if (!res.ok) throw new Error("HTTP " + res.status);
  await (await caches.open(CACHE)).put(url, res);
  localStorage.setItem(LIB_KEY, JSON.stringify([...lib(), { ...t, sources: [url] }]));
  navigator.storage?.persist?.();                       // ask the browser not to evict saved music
}
async function removeOffline(t) {
  const item = lib().find(x => x.id === t.id);
  if (item) await (await caches.open(CACHE)).delete(item.sources[0]);
  localStorage.setItem(LIB_KEY, JSON.stringify(lib().filter(x => x.id !== t.id)));
}
$("lib-btn").onclick = () => {
  $("results").innerHTML = ""; $("more").classList.add("hidden");
  lib().forEach(renderRow);
  $("notice").textContent = lib().length ? "Saved on this device. These play without internet."
                                         : "Nothing saved yet. Press Save offline on any result.";
};

// ---------- Events ----------
$("search-form").onsubmit = e => { e.preventDefault(); page = 1; runSearch(); };
$("more").onclick = () => { page++; runSearch(true); };
runSearch(); // show popular items on first load
