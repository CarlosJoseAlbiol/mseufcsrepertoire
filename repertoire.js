/* ═══════════════════════════════════════════════════
   MSEUF Concert Singers – Song Repertoire Tracker
   repertoire.js  |  Supabase shared database
═══════════════════════════════════════════════════ */

const SUPABASE_URL = "https://aevaojekkijhzlxthlpb.supabase.co";
const SUPABASE_KEY = "sb_publishable_B5ayfQIcgSAFmTYGE7ju2Q_4EDrigPo";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let statuses    = {};
let customSongs = [];
let currentCat  = "BATCH";
let saving      = {};
let deletingId  = null;

const DIFF_COLORS = { EASY: "var(--easy)", MEDIUM: "var(--medium)", HARD: "var(--hard)" };

const STATUS_LABELS = {
  "rehearsed":        "✔ Rehearsed",
  "not-rehearsed":    "✘ Not Rehearsed",
  "to-be-rehearsed":  "🔔 To Be Rehearsed",
  "assessed":         "◉ Sang for Assessment",
  "none":             "— No Status"
};

const STATUS_COLORS = {
  "rehearsed":        "var(--s-rehearsed)",
  "not-rehearsed":    "var(--s-not-rehearsed)",
  "to-be-rehearsed":  "var(--s-to-be-rehearsed)",
  "assessed":         "var(--s-assessed)",
  "none":             "var(--muted)"
};

// Toast
let toastTimer;
function showToast(msg, isError = false) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.background = isError ? "linear-gradient(135deg,#f85149,#ff6b6b)" : "linear-gradient(135deg,#c9a84c,#e8c97a)";
  t.style.color = isError ? "#fff" : "#2d0609";
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// Load
async function loadAll() {
  await Promise.all([loadStatuses(), loadCustomSongs()]);
}

async function loadStatuses() {
  try {
    const { data, error } = await db.from("repertoire_status").select("id, status");
    if (error) throw error;
    statuses = {};
    (data || []).forEach(r => { statuses[r.id] = r.status; });
    renderSongs();
  } catch (err) {
    showToast("Could not load: " + err.message, true);
    renderSongs();
  }
}

async function loadCustomSongs() {
  try {
    const { data, error } = await db.from("repertoire_songs").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    customSongs = data || [];
    renderSongs();
  } catch (err) { console.error(err); }
}

function getMergedSongs(cat, diff) {
  const builtin = ((SONGS_DB[cat] || {})[diff] || []);
  const custom  = customSongs.filter(s => s.category === cat && s.difficulty === diff)
    .map(s => ({ id: s.id, title: s.title, solo: s.solo || "NONE", isCustom: true }));
  return [...builtin, ...custom];
}

// Status toggle
async function setStatus(songId, newStatus) {
  const current     = statuses[songId] || "none";
  const finalStatus = (current === newStatus) ? "none" : newStatus;
  statuses[songId]  = finalStatus;
  updateStatusButtons(songId, finalStatus);
  updateStats();
  clearTimeout(saving[songId]);
  saving[songId] = setTimeout(async () => {
    try {
      const { error } = await db.from("repertoire_status")
        .upsert({ id: songId, status: finalStatus, updated_at: new Date().toISOString() });
      if (error) throw error;
      showToast(finalStatus === "none" ? "Status cleared" : STATUS_LABELS[finalStatus]);
    } catch (err) { showToast("Save failed: " + err.message, true); }
  }, 400);
}

function updateStatusButtons(songId, status) {
  ["rehearsed","not-rehearsed","to-be-rehearsed","assessed"].forEach(s => {
    const btn = document.getElementById("btn-" + songId + "-" + s);
    if (!btn) return;
    btn.classList.remove("active-rehearsed","active-not-rehearsed","active-to-be-rehearsed","active-assessed");
    if (status === s) btn.classList.add("active-" + s);
  });
  const lbl = document.getElementById("lbl-" + songId);
  if (lbl) {
    lbl.textContent = status === "none" ? "" : STATUS_LABELS[status];
    lbl.style.color = STATUS_COLORS[status] || "var(--muted)";
  }
}

// Modals
function openAddModal() {
  document.getElementById("modal-title").textContent = "＋ Add New Song";
  document.getElementById("m-title").value    = "";
  document.getElementById("m-diff").value     = "EASY";
  document.getElementById("m-solo").value     = "NONE";
  document.getElementById("m-category").value = currentCat;
  document.getElementById("m-edit-id").value  = "";
  document.getElementById("m-save-btn").textContent = "💾 Save Song";
  document.getElementById("song-modal").classList.add("open");
  setTimeout(() => document.getElementById("m-title").focus(), 100);
}

function openAddModalFor(diff) { openAddModal(); document.getElementById("m-diff").value = diff; }

function openEditModal(songId) {
  const song = customSongs.find(s => s.id === songId);
  if (!song) return;
  document.getElementById("modal-title").textContent = "✏ Edit Song";
  document.getElementById("m-title").value    = song.title;
  document.getElementById("m-diff").value     = song.difficulty;
  document.getElementById("m-solo").value     = song.solo || "NONE";
  document.getElementById("m-category").value = song.category || currentCat;
  document.getElementById("m-edit-id").value  = song.id;
  document.getElementById("m-save-btn").textContent = "💾 Update Song";
  document.getElementById("song-modal").classList.add("open");
  setTimeout(() => document.getElementById("m-title").focus(), 100);
}

function closeModal() { document.getElementById("song-modal").classList.remove("open"); }

async function saveSongModal() {
  const title    = document.getElementById("m-title").value.trim();
  const diff     = document.getElementById("m-diff").value;
  const solo     = document.getElementById("m-solo").value;
  const category = document.getElementById("m-category").value;
  const editId   = document.getElementById("m-edit-id").value;
  if (!title) { showToast("⚠ Please enter a song title", true); return; }
  const btn = document.getElementById("m-save-btn");
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    if (editId) {
      const { error } = await db.from("repertoire_songs").update({ title, difficulty: diff, solo, category }).eq("id", editId);
      if (error) throw error;
      showToast("✅ Song updated!");
    } else {
      const { error } = await db.from("repertoire_songs").insert([{ id: "custom_" + Date.now(), title, difficulty: diff, solo, category, created_at: new Date().toISOString() }]);
      if (error) throw error;
      showToast("✅ Song added!");
    }
    closeModal();
    await loadCustomSongs();
  } catch (err) { showToast("Save failed: " + err.message, true); }
  finally { btn.disabled = false; btn.textContent = editId ? "💾 Update Song" : "💾 Save Song"; }
}

function openDeleteModal(songId, songTitle) {
  deletingId = songId;
  document.getElementById("delete-song-name").textContent = songTitle;
  document.getElementById("delete-modal").classList.add("open");
}

function closeDeleteModal() { deletingId = null; document.getElementById("delete-modal").classList.remove("open"); }

async function confirmDelete() {
  if (!deletingId) return;
  const btn = document.getElementById("confirm-delete-btn");
  btn.disabled = true; btn.textContent = "Deleting…";
  try {
    const { error } = await db.from("repertoire_songs").delete().eq("id", deletingId);
    if (error) throw error;
    await db.from("repertoire_status").delete().eq("id", deletingId);
    delete statuses[deletingId];
    showToast("Song deleted");
    closeDeleteModal();
    await loadCustomSongs();
  } catch (err) { showToast("Delete failed: " + err.message, true); }
  finally { btn.disabled = false; btn.textContent = "🗑 Delete"; }
}

function switchCat(cat) {
  currentCat = cat;
  document.querySelectorAll(".cat-tab").forEach(t => t.classList.toggle("active", t.dataset.cat === cat));
  renderSongs();
}

// Render
function renderSongs() {
  const query        = (document.getElementById("search-input").value || "").toLowerCase();
  const filterDiff   = document.getElementById("filter-diff").value;
  const filterStatus = document.getElementById("filter-status").value;
  const grid         = document.getElementById("song-grid");
  let html = "";

  ["EASY","MEDIUM","HARD"].forEach(diff => {
    if (filterDiff && filterDiff !== diff) return;
    const songs = getMergedSongs(currentCat, diff).filter(s => {
      const matchQ = !query || s.title.toLowerCase().includes(query);
      const st     = statuses[s.id] || "none";
      return matchQ && (!filterStatus || st === filterStatus);
    });
    if (!songs.length) return;
    const diffLabel = diff.charAt(0) + diff.slice(1).toLowerCase();
    html += `
      <div class="diff-section">
        <div class="diff-header">
          <div class="diff-dot" style="background:${DIFF_COLORS[diff]}"></div>
          <span style="color:${DIFF_COLORS[diff]};font-family:'Playfair Display',serif">${diffLabel}</span>
          <span class="diff-count">${songs.length} song${songs.length !== 1 ? "s" : ""}</span>
          <button class="btn btn-gold btn-sm" style="margin-left:10px;font-size:.7rem;padding:3px 10px"
                  onclick="openAddModalFor('${diff}')">＋ Add to ${diffLabel}</button>
        </div>
        <table class="song-table">
          <thead>
            <tr>
              <th style="width:36px">#</th>
              <th>Song Title</th>
              <th>Solo / Descant</th>
              <th>Status</th>
              <th>Label</th>
              <th style="width:90px;text-align:center">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${songs.map((s, i) => {
              const st  = statuses[s.id] || "none";
              const stC = STATUS_COLORS[st] || "var(--muted)";
              const id  = s.id;
              return `<tr>
                <td style="color:var(--muted);font-size:.76rem">${i + 1}</td>
                <td class="song-title">${escHtml(s.title)}${s.isCustom ? ' <span style="font-size:.64rem;color:var(--gold);opacity:.75">★</span>' : ""}</td>
                <td><span class="solo-badge solo-${s.solo}">${s.solo}</span></td>
                <td>
                  <div class="status-group">
                    <button class="status-toggle ${st==="rehearsed"?"active-rehearsed":""}" id="btn-${id}-rehearsed" onclick="setStatus('${id}','rehearsed')" title="Rehearsed">✔</button>
                    <button class="status-toggle ${st==="not-rehearsed"?"active-not-rehearsed":""}" id="btn-${id}-not-rehearsed" onclick="setStatus('${id}','not-rehearsed')" title="Not Rehearsed">✘</button>
                    <button class="status-toggle ${st==="to-be-rehearsed"?"active-to-be-rehearsed":""}" id="btn-${id}-to-be-rehearsed" onclick="setStatus('${id}','to-be-rehearsed')" title="To Be Rehearsed">🔔</button>
                    <button class="status-toggle ${st==="assessed"?"active-assessed":""}" id="btn-${id}-assessed" onclick="setStatus('${id}','assessed')" title="Sang for Assessment">◉</button>
                  </div>
                </td>
                <td><span class="status-label" id="lbl-${id}" style="color:${stC}">${st !== "none" ? STATUS_LABELS[st] : ""}</span></td>
                <td style="text-align:center">
                  ${s.isCustom
                    ? `<div style="display:flex;gap:5px;justify-content:center">
                         <button class="action-btn edit-btn" onclick="openEditModal('${id}')" title="Edit">✏</button>
                         <button class="action-btn del-btn" onclick="openDeleteModal('${id}','${s.title.replace(/'/g,"\\'")}')" title="Delete">🗑</button>
                       </div>`
                    : `<span style="font-size:.66rem;color:var(--gold);font-style:italic;font-weight:600">MSEUFCS</span>`}
                </td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`;
  });

  grid.innerHTML = html || `<div class="empty-state"><div class="icon">🔍</div><p>No songs match your filters.</p></div>`;
  updateStats();
}

// Stats
function updateStats() {
  let total = 0, rehearsed = 0, notRehearsed = 0, toBeRehearsed = 0, assessed = 0;
  ["EASY","MEDIUM","HARD"].forEach(diff => {
    getMergedSongs(currentCat, diff).forEach(s => {
      total++;
      const st = statuses[s.id] || "none";
      if (st === "rehearsed")       rehearsed++;
      if (st === "not-rehearsed")   notRehearsed++;
      if (st === "to-be-rehearsed") toBeRehearsed++;
      if (st === "assessed")        assessed++;
    });
  });
  const none = total - rehearsed - notRehearsed - toBeRehearsed - assessed;
  document.getElementById("stats-bar").innerHTML = `
    <span class="stat-pill" style="background:rgba(63,185,80,.15);color:var(--s-rehearsed)">✔ ${rehearsed}</span>
    <span class="stat-pill" style="background:rgba(248,81,73,.12);color:var(--s-not-rehearsed)">✘ ${notRehearsed}</span>
    <span class="stat-pill" style="background:rgba(255,193,7,.15);color:var(--s-to-be-rehearsed)">🔔 ${toBeRehearsed}</span>
    <span class="stat-pill" style="background:rgba(201,168,76,.15);color:var(--s-assessed)">◉ ${assessed}</span>
    <span class="stat-pill" style="background:rgba(110,118,129,.1);color:var(--muted)">— ${none}</span>
    <span style="font-size:.72rem;color:var(--muted)">/ ${total}</span>
  `;
}

function escHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

document.addEventListener("DOMContentLoaded", () => {
  loadAll();
  setInterval(loadAll, 15000);
  document.getElementById("song-modal").addEventListener("click", e => { if (e.target === document.getElementById("song-modal")) closeModal(); });
  document.getElementById("delete-modal").addEventListener("click", e => { if (e.target === document.getElementById("delete-modal")) closeDeleteModal(); });
  document.getElementById("m-title").addEventListener("keydown", e => { if (e.key === "Enter") saveSongModal(); });
});
