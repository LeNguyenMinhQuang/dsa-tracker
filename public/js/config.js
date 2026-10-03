const state = {
  year: null,
  month: null,
  today: null,
  activeDate: null,
  currentDay: null,
};

const USER_KEY = "dsa-user";

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch (e) {
    return null;
  }
}

let currentUser = getStoredUser();

function api(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (currentUser && currentUser.token)
    headers["Authorization"] = "Bearer " + currentUser.token;
  return window.fetch(url, { ...opts, headers }).then((res) => {
    // 401 = session missing/expired. (A wrong password on /api/login is also 401
    // but must not log the user out.)
    if (res.status === 401 && !url.startsWith("/api/login")) {
      try {
        localStorage.removeItem(USER_KEY);
      } catch (e) {}
      showUserPicker();
      return new Promise(() => {});
    }
    return res;
  });
}

function fmtDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

let currentAudio = null;

function youdaoUrl(text, lang) {
  const type = lang === "en-GB" ? 1 : 2;
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=${type}`;
}

const dictAudioCache = new Map();
async function getDictAudio(term, lang) {
  const key = term.trim().toLowerCase();
  if (!key || key.includes(" ")) return null;

  if (!dictAudioCache.has(key)) {
    const result = { uk: null, us: null };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    try {
      const res = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`,
        { signal: ctrl.signal },
      );
      if (res.ok) {
        const data = await res.json();
        for (const entry of data) {
          for (const p of entry.phonetics || []) {
            if (!p.audio) continue;
            if (!result.uk && /-uk\.mp3$/i.test(p.audio)) result.uk = p.audio;
            if (!result.us && /-us\.mp3$/i.test(p.audio)) result.us = p.audio;
          }
        }
      }
    } catch (e) {
    } finally {
      clearTimeout(timer);
    }
    dictAudioCache.set(key, result);
  }
  const r = dictAudioCache.get(key);
  return lang === "en-GB" ? r.uk : r.us;
}

function speakWithSynthesis(text, lang) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
}

function playUrl(src) {
  const audio = new Audio(src);
  currentAudio = audio;
  return audio.play();
}

async function speak(text, lang) {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  try {
    await playUrl(youdaoUrl(text, lang));
    return;
  } catch (e) {}

  try {
    const dictUrl = await getDictAudio(text, lang);
    if (dictUrl) {
      await playUrl(dictUrl);
      return;
    }
  } catch (e) {}

  speakWithSynthesis(text, lang);
}

function buildSpeakButtons(term) {
  const wrap = document.createElement("span");
  wrap.className = "speak-group";
  [
    { lang: "en-GB", label: "UK", title: "British Pronunciation" },
    { lang: "en-US", label: "US", title: "American Pronunciation" },
  ].forEach(({ lang, label, title }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "speak-btn";
    btn.title = title;
    btn.innerHTML = `<span class="speak-icon">🔊</span><span class="speak-label">${label}</span>`;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      speak(term, lang);
    });
    wrap.appendChild(btn);
  });
  return wrap;
}
