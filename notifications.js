/* ═══════════════════════════════════════════════════
   MSEUF Concert Singers – Notifications & Calendar
   notifications.js
═══════════════════════════════════════════════════ */

// ─── Stored reminders (localStorage) ───
const REMINDERS_KEY = "mseufcs_reminders";
let reminders = JSON.parse(localStorage.getItem(REMINDERS_KEY) || "[]");

// Active setTimeout handles for in-tab reminders
const reminderTimers = {};

// ─── Service Worker registration ───
async function registerSW() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("sw.js");
    return reg;
  } catch (e) {
    console.warn("SW registration failed:", e);
    return null;
  }
}

// ─── Detect platform ───
function getPlatform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua))   return "ios";
  if (/Android/.test(ua))            return "android";
  return "desktop";
}

function getPlatformNote() {
  const p = getPlatform();
  if (p === "ios")     return "📱 iPhone/iPad detected — requires iOS 16.4+ and adding this page to your Home Screen for notifications.";
  if (p === "android") return "📱 Android detected — notifications supported via Chrome or Firefox.";
  return "💻 Desktop detected — notifications supported in Chrome, Firefox, and Edge.";
}

// ─── Modal open/close ───
function openNotifModal() {
  updateNotifStatus();
  renderReminders();
  document.getElementById("notif-modal").classList.add("open");
  // Pre-fill today's date
  const today = new Date();
  const dateStr = today.toISOString().split("T")[0];
  document.getElementById("sched-date").value = dateStr;
}

function closeNotifModal() {
  document.getElementById("notif-modal").classList.remove("open");
}

function updateNotifStatus() {
  const msg     = document.getElementById("notif-status-msg");
  const enableBtn = document.getElementById("enable-notif-btn");
  const testBtn   = document.getElementById("test-notif-btn");

  // Platform note
  const platformNote = `<div style="font-size:.75rem;color:var(--gold);margin-bottom:8px">${getPlatformNote()}</div>`;

  if (!("Notification" in window)) {
    msg.innerHTML = platformNote + `<span style="color:var(--s-not-rehearsed)">❌ Notifications not supported in this browser.</span>`;
    enableBtn.style.display = "none";
    return;
  }

  const perm = Notification.permission;
  if (perm === "granted") {
    msg.innerHTML = platformNote + `<span style="color:var(--s-rehearsed)">✔ Notifications enabled!</span>`;
    enableBtn.style.display = "none";
    testBtn.style.display   = "inline-flex";
  } else if (perm === "denied") {
    msg.innerHTML = platformNote + `<span style="color:var(--s-not-rehearsed)">✘ Notifications blocked. Please allow them in your browser settings, then refresh.</span>`;
    enableBtn.style.display = "none";
    testBtn.style.display   = "none";
  } else {
    msg.innerHTML = platformNote + `<span style="color:var(--s-to-be-rehearsed)">⚠ Permission not yet granted.</span>`;
    enableBtn.style.display = "inline-flex";
    testBtn.style.display   = "none";
  }
}

// ─── Request permission ───
async function requestNotifPermission() {
  if (!("Notification" in window)) {
    showToast("Notifications not supported on this device", true);
    return;
  }
  const result = await Notification.requestPermission();
  updateNotifStatus();
  if (result === "granted") {
    await registerSW();
    showToast("✔ Notifications enabled!");
    sendTestNotif();
  } else {
    showToast("Notifications were blocked", true);
  }
}

// ─── Test notification ───
function sendTestNotif() {
  if (Notification.permission !== "granted") return;
  new Notification("🎵 MSEUF Concert Singers", {
    body: "Notifications are working! You'll receive rehearsal reminders here.",
    icon: "logo.png",
    badge: "logo.png"
  });
}

// ─── Schedule a reminder ───
async function scheduleReminder() {
  const title    = document.getElementById("sched-title").value.trim()    || "MSEUF Rehearsal";
  const date     = document.getElementById("sched-date").value;
  const time     = document.getElementById("sched-time").value            || "14:00";
  const duration = parseInt(document.getElementById("sched-duration").value) || 60;
  const remind   = parseInt(document.getElementById("sched-remind").value)   || 30;
  const location = document.getElementById("sched-location").value.trim();
  const notes    = document.getElementById("sched-notes").value.trim();

  if (!date) { showToast("⚠ Please pick a date", true); return; }

  const rehearsalTime = new Date(`${date}T${time}`);
  if (isNaN(rehearsalTime)) { showToast("⚠ Invalid date/time", true); return; }

  const notifyTime = new Date(rehearsalTime.getTime() - remind * 60 * 1000);
  const now        = new Date();

  const reminder = {
    id:          "rem_" + Date.now(),
    title,
    date,
    time,
    duration,
    remind,
    location,
    notes,
    rehearsalTs: rehearsalTime.getTime(),
    notifyTs:    notifyTime.getTime(),
    created:     now.getTime()
  };

  reminders.push(reminder);
  saveReminders();
  scheduleTimer(reminder);
  renderReminders();
  showToast(`⏰ Reminder set for ${formatDate(rehearsalTime)}`);

  // Confirm with notification if permission granted
  if (Notification.permission === "granted") {
    new Notification("⏰ Reminder Set!", {
      body: `You'll be notified ${remind} min before "${title}" on ${date} at ${time}`,
      icon: "logo.png"
    });
  }
}

// ─── Set a setTimeout for in-browser reminders ───
function scheduleTimer(rem) {
  const now  = Date.now();
  const diff = rem.notifyTs - now;
  if (diff <= 0) return; // Already past

  clearTimeout(reminderTimers[rem.id]);
  reminderTimers[rem.id] = setTimeout(() => {
    fireReminder(rem);
  }, diff);
}

function fireReminder(rem) {
  const body = `${rem.title} starts in ${rem.remind} min${rem.location ? " at " + rem.location : ""}`;
  if (Notification.permission === "granted") {
    new Notification("🎵 Rehearsal Starting Soon!", {
      body,
      icon:    "logo.png",
      badge:   "logo.png",
      tag:     rem.id,
      vibrate: [200, 100, 200, 100, 200]
    });
  }
  showToast("🔔 " + body);
}

function saveReminders() {
  localStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders));
}

function deleteReminder(id) {
  clearTimeout(reminderTimers[id]);
  delete reminderTimers[id];
  reminders = reminders.filter(r => r.id !== id);
  saveReminders();
  renderReminders();
  showToast("Reminder removed");
}

// ─── Render reminders list ───
function renderReminders() {
  const container = document.getElementById("reminders-list");
  if (!container) return;

  const now    = Date.now();
  const future = reminders.filter(r => r.rehearsalTs > now).sort((a, b) => a.rehearsalTs - b.rehearsalTs);
  const past   = reminders.filter(r => r.rehearsalTs <= now).sort((a, b) => b.rehearsalTs - a.rehearsalTs);

  if (!reminders.length) {
    container.innerHTML = `<p style="color:var(--muted);font-size:.83rem">No reminders set yet.</p>`;
    return;
  }

  const renderGroup = (list, label) => {
    if (!list.length) return "";
    return `
      <div style="font-size:.68rem;font-weight:700;color:var(--gold);text-transform:uppercase;letter-spacing:.08em;margin:10px 0 6px">${label}</div>
      ${list.map(r => `
        <div class="reminder-card ${r.rehearsalTs <= now ? "past" : ""}">
          <div class="reminder-info">
            <div class="reminder-title">${escHtmlN(r.title)}</div>
            <div class="reminder-meta">
              📅 ${r.date} &nbsp;🕐 ${r.time}
              ${r.location ? ` &nbsp;📍 ${escHtmlN(r.location)}` : ""}
              &nbsp;⏱ ${r.duration} min
              &nbsp;🔔 ${r.remind} min before
            </div>
            ${r.notes ? `<div class="reminder-notes">📝 ${escHtmlN(r.notes)}</div>` : ""}
          </div>
          <div style="display:flex;gap:5px;align-items:center">
            <button class="btn btn-calendar btn-sm" onclick="exportSingleToCalendar('google','${r.id}')" title="Add to Google Calendar">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H18V1H16V3H8V1H6V3H5C3.89 3 3.01 3.9 3.01 5L3 19C3 20.1 3.89 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM19 19H5V8H19V19ZM7 10H12V15H7Z"/></svg>
            </button>
            <button class="btn btn-calendar btn-sm" onclick="exportSingleToCalendar('ics','${r.id}')" title="Download .ics">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17 12H12V17H17V12ZM16 1V3H8V1H6V3H5C3.89 3 3 3.9 3 5L3 19C3 20.1 3.89 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3H18V1H16ZM19 19H5V8H19V19Z"/></svg>
            </button>
            <button class="action-btn del-btn" onclick="deleteReminder('${r.id}')" title="Remove reminder">🗑</button>
          </div>
        </div>`).join("")}
    `;
  };

  container.innerHTML = renderGroup(future, "📆 Upcoming") + renderGroup(past, "🕐 Past");
}

// ─── Calendar export ───
function exportToCalendar(type) {
  const title    = document.getElementById("sched-title").value.trim()    || "MSEUF Rehearsal";
  const date     = document.getElementById("sched-date").value;
  const time     = document.getElementById("sched-time").value            || "14:00";
  const duration = parseInt(document.getElementById("sched-duration").value) || 60;
  const location = document.getElementById("sched-location").value.trim();
  const notes    = document.getElementById("sched-notes").value.trim();

  if (!date) { showToast("⚠ Please fill in a date first", true); return; }

  const rem = { title, date, time, duration, location, notes, rehearsalTs: new Date(`${date}T${time}`).getTime() };
  doCalendarExport(type, rem);
}

function exportSingleToCalendar(type, remId) {
  const rem = reminders.find(r => r.id === remId);
  if (rem) doCalendarExport(type, rem);
}

function doCalendarExport(type, rem) {
  const start = new Date(rem.rehearsalTs);
  const end   = new Date(start.getTime() + rem.duration * 60 * 1000);

  if (type === "google") {
    const fmt = d => d.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");
    const url = new URL("https://calendar.google.com/calendar/render");
    url.searchParams.set("action",   "TEMPLATE");
    url.searchParams.set("text",     rem.title);
    url.searchParams.set("dates",    `${fmt(start)}/${fmt(end)}`);
    url.searchParams.set("details",  rem.notes || "MSEUF Concert Singers Rehearsal");
    if (rem.location) url.searchParams.set("location", rem.location);
    window.open(url.toString(), "_blank");
    showToast("Opening Google Calendar…");
    return;
  }

  // ICS file (works with Apple Calendar, Outlook, any calendar app)
  const fmtLocal = d => {
    const pad = n => String(n).padStart(2,"0");
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  };

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MSEUF Concert Singers//Repertoire Tracker//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${Date.now()}@mseufcs`,
    `DTSTART:${fmtLocal(start)}`,
    `DTEND:${fmtLocal(end)}`,
    `SUMMARY:${rem.title}`,
    `DESCRIPTION:${rem.notes || "MSEUF Concert Singers Rehearsal"}`,
    rem.location ? `LOCATION:${rem.location}` : "",
    `BEGIN:VALARM`,
    `TRIGGER:-PT${rem.remind || 30}M`,
    `ACTION:DISPLAY`,
    `DESCRIPTION:Reminder: ${rem.title}`,
    `END:VALARM`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].filter(Boolean).join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(blob);
  a.download = rem.title.replace(/[^a-z0-9]/gi,"_") + ".ics";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast("📅 .ics file downloaded — open it to add to your calendar");
}

// ─── Helpers ───
function formatDate(d) {
  return d.toLocaleDateString("en-PH", { weekday:"short", month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" });
}

function escHtmlN(s) {
  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ─── Init ───
document.addEventListener("DOMContentLoaded", () => {
  registerSW();

  // Schedule timers for all saved reminders
  reminders.forEach(rem => scheduleTimer(rem));

  // Close modal on backdrop click
  document.getElementById("notif-modal").addEventListener("click", e => {
    if (e.target === document.getElementById("notif-modal")) closeNotifModal();
  });

  // Show notification bell badge if there are upcoming reminders
  updateBellBadge();
});

function updateBellBadge() {
  const btn    = document.getElementById("notif-btn");
  if (!btn) return;
  const now    = Date.now();
  const upcoming = reminders.filter(r => r.rehearsalTs > now).length;
  if (upcoming > 0) {
    btn.innerHTML = `🔔 Reminders <span class="bell-badge">${upcoming}</span>`;
  }
}