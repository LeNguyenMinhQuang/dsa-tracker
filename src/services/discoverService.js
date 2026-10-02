const https = require("https");
const { DISCOVER_TOPICS, FALLBACK_WORDS, POS_SHORT } = require("../config/constants");
const { loadData } = require("./dsaService");

function shuffleArr(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getJson(url, stage, diag, timeoutMs = 6000) {
  const bump = (k) => (diag[k][stage] = (diag[k][stage] || 0) + 1);
  return new Promise((resolve) => {
    const fail = (msg) => {
      bump("fail");
      if (!diag.errors[stage]) diag.errors[stage] = msg;
      resolve(null);
    };
    try {
      const req = https.get(
        url,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
            Accept: "application/json",
          },
          timeout: timeoutMs,
        },
        (r) => {
          if (r.statusCode < 200 || r.statusCode >= 300) {
            r.resume();
            return fail("HTTP " + r.statusCode);
          }
          let buf = "";
          r.setEncoding("utf8");
          r.on("data", (c) => (buf += c));
          r.on("end", () => {
            try {
              const j = JSON.parse(buf);
              bump("ok");
              resolve(j);
            } catch (e) {
              fail("JSON error");
            }
          });
        },
      );
      req.on("timeout", () => req.destroy(new Error("timeout")));
      req.on("error", (e) => fail(e.message || String(e)));
    } catch (e) {
      fail(e.message || String(e));
    }
  });
}

function isKnownForm(word, existing) {
  if (existing.has(word)) return true;
  const stems = [
    word.replace(/ies$/, "y"),
    word.replace(/es$/, ""),
    word.replace(/s$/, ""),
    word.replace(/ed$/, ""),
    word.replace(/ing$/, ""),
  ];
  return stems.some((st) => st !== word && st.length >= 3 && existing.has(st));
}

async function datamuseCandidates(existing, diag) {
  const topics = shuffleArr(DISCOVER_TOPICS).slice(0, 3);
  const lists = await Promise.all(
    topics.map((t) =>
      getJson(
        `https://api.datamuse.com/words?ml=${encodeURIComponent(t)}&md=fp&max=300`,
        "datamuse",
        diag,
      ),
    ),
  );
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const w = String(item.word || "").toLowerCase();
      if (!/^[a-z]{4,14}$/.test(w) || seen.has(w) || isKnownForm(w, existing))
        continue;
      const f = (item.tags || []).find((t) => String(t).startsWith("f:"));
      const freq = f ? parseFloat(String(f).slice(2)) : 0;
      if (!(freq >= 1 && freq <= 300)) continue;
      seen.add(w);
      out.push(w);
    }
  }
  return shuffleArr(out);
}

async function lookupWord(word, diag) {
  const data = await getJson(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    "dictionary",
    diag,
  );
  if (!Array.isArray(data) || data.length === 0) return null;

  let pron = "";
  for (const e of data) {
    if (e.phonetic) {
      pron = e.phonetic;
      break;
    }
    const p = (e.phonetics || []).find((x) => x.text);
    if (p) {
      pron = p.text;
      break;
    }
  }
  for (const e of data) {
    const m = (e.meanings || []).find(
      (x) => x.definitions && x.definitions[0] && x.definitions[0].definition,
    );
    if (!m) continue;
    const withExample = m.definitions.find((d) => d.example);
    return {
      pronunciation: pron,
      pos: m.partOfSpeech || "",
      englishDef: m.definitions[0].definition,
      example: withExample ? withExample.example : "",
    };
  }
  return pron
    ? { pronunciation: pron, pos: "", englishDef: "", example: "" }
    : null;
}

async function translateToVi(word, pos, diag) {
  const g = await getJson(
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&dt=bd&q=${encodeURIComponent(word)}`,
    "translate",
    diag,
  );
  if (Array.isArray(g)) {
    if (Array.isArray(g[1])) {
      const hit = g[1].find((e) => e[0] === pos) || g[1][0];
      if (hit && Array.isArray(hit[1]) && hit[1].length)
        return hit[1].slice(0, 3).join(", ");
    }
    const t = g[0] && g[0][0] && g[0][0][0];
    if (t && String(t).toLowerCase() !== word) return String(t);
  }
  const mm = await getJson(
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|vi`,
    "mymemory",
    diag,
  );
  const t2 = mm && mm.responseData && mm.responseData.translatedText;
  if (t2 && !/MYMEMORY/i.test(t2) && String(t2).toLowerCase() !== word)
    return String(t2).toLowerCase();
  return null;
}

async function buildDiscoverWord(word, diag) {
  const info = await lookupWord(word, diag);
  const vi = await translateToVi(word, info && info.pos, diag);
  if (!vi) return null;
  const posLabel = info && info.pos ? POS_SHORT[info.pos] || info.pos : "";
  const explain =
    info && info.englishDef
      ? posLabel
        ? `(${posLabel}) ${info.englishDef}`
        : info.englishDef
      : "";
  return {
    term: word,
    pronunciation: info ? info.pronunciation : "",
    meanings: [{ definition: vi, explain, example: info ? info.example : "" }],
  };
}

async function discoverWords(req, body) {
  const data = await loadData(req);
  const count = Math.min(Math.max(parseInt(body.count, 10) || 10, 1), 20);

  const existing = new Set(
    Object.values(data.words).map((w) => w.term.trim().toLowerCase()),
  );
  const skipped = Array.isArray(body.exclude)
    ? body.exclude.slice(0, 1000).map((x) => String(x).toLowerCase())
    : [];
  skipped.forEach((x) => existing.add(x));

  const diag = { ok: {}, fail: {}, errors: {}, usedFallback: false };

  const primary = await datamuseCandidates(existing, diag);
  const fallback = shuffleArr(FALLBACK_WORDS).filter(
    (w) => !isKnownForm(w, existing) && !primary.includes(w),
  );
  diag.usedFallback = primary.length === 0;
  const cands = [...primary, ...fallback];

  const results = [];
  const deadline = Date.now() + 22000;
  for (
    let i = 0;
    i < cands.length && results.length < count && Date.now() < deadline;
    i += 6
  ) {
    const out = await Promise.all(
      cands.slice(i, i + 6).map((w) => buildDiscoverWord(w, diag)),
    );
    for (const o of out) if (o && results.length < count) results.push(o);
  }

  if (results.length === 0) {
    console.error("Discover failed:", JSON.stringify(diag));
    const err = new Error("Could not retrieve Vietnamese definitions from translation APIs");
    err.status = 502;
    err.debug = diag;
    throw err;
  }
  return results;
}

module.exports = {
  discoverWords,
};
