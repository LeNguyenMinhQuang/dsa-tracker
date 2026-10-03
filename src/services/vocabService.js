const crypto = require("crypto");
const redis = require("../config/redis");
const { GROUPS_KEY } = require("../config/constants");
const { loadData, saveData } = require("./dsaService");
const { todayStr } = require("../utils/dateUtils");
const imageService = require("./imageService");

function validMeanings(meanings) {
  if (!Array.isArray(meanings) || meanings.length === 0) return null;
  const cleaned = meanings
    .map((m) => ({
      definition: (m.definition || "").trim(),
      explain: (m.explain || "").trim(),
      example: (m.example || "").trim(),
    }))
    .filter((m) => m.definition);
  return cleaned.length > 0 ? cleaned : null;
}

async function getGroups() {
  const groups = Object.values((await redis.get(GROUPS_KEY)) || {}).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return groups;
}

// Queue image generation for a word (shared across users, fire-and-forget)
function queueImage(word) {
  const hint = imageService.meaningHint(word); // Vietnamese meaning
  imageService
    .enqueueTerms([{ term: word.term, hint }])
    .then((stats) => {
      if (stats.queued > 0) imageService.wake();
    })
    .catch((e) => console.error("[images] enqueue failed:", e.message));
}

async function getWords(req) {
  const data = await loadData(req);
  const words = Object.values(data.words).sort((a, b) =>
    a.term.localeCompare(b.term),
  );
  // Images live in a shared hash, not in the user document
  const urls = await imageService.getImageUrls(words.map((w) => w.term));
  return words.map((w) => ({
    ...w,
    imageUrl: urls[imageService.normalizeTerm(w.term)] || null,
  }));
}

async function createWord(req, body) {
  const data = await loadData(req);
  const { term, pronunciation, groupId, meanings, status } = body;
  if (!term || !term.trim()) {
    const err = new Error("Word term cannot be empty");
    err.status = 400;
    throw err;
  }
  const cleaned = validMeanings(meanings);
  if (!cleaned) {
    const err = new Error("At least 1 valid definition is required");
    err.status = 400;
    throw err;
  }

  const hasStatus =
    status === "known" || status === "unsure" || status === "review";

  const id = crypto.randomUUID();
  const word = {
    id,
    term: term.trim(),
    pronunciation: (pronunciation || "").trim(),
    groupId: groupId || null,
    meanings: cleaned,
    status: hasStatus ? status : "unsure",
    createdDate: todayStr(),
    lastReviewed: hasStatus ? todayStr() : null,
    reviewCount: hasStatus ? 1 : 0,
  };
  data.words[id] = word;
  await saveData(req, data);
  queueImage(word);
  return word;
}

async function updateWord(req, id, body) {
  const data = await loadData(req);
  const word = data.words[id];
  if (!word) {
    const err = new Error("Word not found");
    err.status = 404;
    throw err;
  }
  const { term, pronunciation, groupId, meanings } = body;
  const oldTerm = word.term;
  if (term && term.trim()) word.term = term.trim();
  if (pronunciation !== undefined)
    word.pronunciation = (pronunciation || "").trim();
  if (groupId !== undefined) word.groupId = groupId || null;
  const cleaned = validMeanings(meanings);
  if (cleaned) word.meanings = cleaned;
  await saveData(req, data);
  if (
    imageService.normalizeTerm(word.term) !==
    imageService.normalizeTerm(oldTerm)
  ) {
    queueImage(word);
  }
  return word;
}

async function deleteWord(req, id) {
  const data = await loadData(req);
  if (!data.words[id]) {
    const err = new Error("Word not found");
    err.status = 404;
    throw err;
  }
  delete data.words[id];
  await saveData(req, data);
  return { ok: true };
}

async function setWordStatus(req, id, status) {
  const data = await loadData(req);
  const word = data.words[id];
  if (!word) {
    const err = new Error("Word not found");
    err.status = 404;
    throw err;
  }
  if (status !== "known" && status !== "unsure" && status !== "review") {
    const err = new Error("Invalid status value");
    err.status = 400;
    throw err;
  }
  word.status = status;
  word.lastReviewed = todayStr();
  word.reviewCount = (word.reviewCount || 0) + 1;
  await saveData(req, data);
  return word;
}

module.exports = {
  getGroups,
  getWords,
  createWord,
  updateWord,
  deleteWord,
  setWordStatus,
};
