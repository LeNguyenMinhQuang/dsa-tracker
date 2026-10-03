const statusLabel = {
  known: "Mastered",
  review: "Review",
  unsure: "Learning",
};
const STATUS_ORDER = ["unsure", "review", "known"];

const vocab = {
  words: [],
  groups: {},
  groupList: [],
  filter: "all",
  groupFilter: "",
  search: "",
  editingId: null,
  imagePollTimer: null,
  imagePollTries: 0,
};

const IMAGE_POLL_MS = 8000;
const IMAGE_POLL_MAX = 15;

function initVocab() {
  document
    .getElementById("addWordBtn")
    .addEventListener("click", () => openWordModal(null));
  document
    .getElementById("wordCancel")
    .addEventListener("click", closeWordModal);
  document
    .getElementById("wordOverlay")
    .addEventListener("click", closeWordModal);
  document.getElementById("wordSave").addEventListener("click", saveWord);
  document.getElementById("wordDelete").addEventListener("click", deleteWord);
  document
    .getElementById("addMeaningRow")
    .addEventListener("click", () => addMeaningRow());

  document.getElementById("vocabSearch").addEventListener("input", (e) => {
    vocab.search = e.target.value.trim().toLowerCase();
    renderWordList();
  });

  document.querySelectorAll("#vocabFilters .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document
        .querySelectorAll("#vocabFilters .chip")
        .forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      vocab.filter = chip.dataset.filter;
      renderWordList();
    });
  });

  document
    .getElementById("vocabGroupFilter")
    .addEventListener("change", (e) => {
      vocab.groupFilter = e.target.value;
      renderWordList();
    });

  loadGroups();
  loadWords();
}

async function loadGroups() {
  const res = await api("/api/groups");
  const groups = await res.json();
  vocab.groupList = groups;
  vocab.groups = {};
  groups.forEach((g) => {
    vocab.groups[g.id] = g;
  });

  const filterSelect = document.getElementById("vocabGroupFilter");
  filterSelect.innerHTML =
    '<option value="">All Topics</option>' +
    groups
      .map(
        (g) =>
          `<option value="${g.id}">${escapeHtml(g.name)} — ${escapeHtml(g.meaning)}</option>`,
      )
      .join("");

  const wordGroupSelect = document.getElementById("wordGroupInput");
  wordGroupSelect.innerHTML =
    '<option value="">Uncategorized</option>' +
    groups
      .map(
        (g) =>
          `<option value="${g.id}">${escapeHtml(g.name)} — ${escapeHtml(g.meaning)}</option>`,
      )
      .join("");
}

function groupLabel(groupId) {
  const g = vocab.groups[groupId];
  if (!g) return "";
  return `${g.name} · ${g.meaning}`;
}

async function loadWords(fromPoll = false) {
  const res = await api("/api/words");
  const words = await res.json();
  if (fromPoll === true) {
    // Silent refresh: only patch images in place, keep open cards open
    mergeWordImages(words);
  } else {
    vocab.words = words;
    vocab.imagePollTries = 0;
    renderWordList();
    updateVocabStats();
  }
  scheduleImagePoll();
}

function mergeWordImages(fresh) {
  const byId = new Map(fresh.map((w) => [w.id, w]));
  vocab.words.forEach((w) => {
    const f = byId.get(w.id);
    if (f && f.imageUrl && w.imageUrl !== f.imageUrl) {
      w.imageUrl = f.imageUrl;
      document
        .querySelectorAll(`.word-card[data-id="${w.id}"]`)
        .forEach((card) => applyWordImage(card, w.imageUrl));
    }
  });
}

// Illustrations are generated in the background; poll a few times until they appear
function scheduleImagePoll() {
  clearTimeout(vocab.imagePollTimer);
  const missing = vocab.words.some((w) => !w.imageUrl);
  if (!missing || vocab.imagePollTries >= IMAGE_POLL_MAX) return;
  vocab.imagePollTimer = setTimeout(() => {
    const tab = document.getElementById("tab-vocab");
    if (document.hidden || !tab || !tab.classList.contains("active")) return;
    vocab.imagePollTries++;
    loadWords(true).catch(() => {});
  }, IMAGE_POLL_MS);
}

function makeWordImg(className, term) {
  const img = document.createElement("img");
  img.className = className;
  img.alt = term;
  img.loading = "lazy";
  img.hidden = true;
  img.addEventListener("error", () => {
    img.hidden = true;
  });
  return img;
}

function applyWordImage(card, url) {
  if (!url) return;
  card.querySelectorAll(".word-thumb, .word-hero").forEach((img) => {
    img.src = url;
    img.hidden = false;
  });
}

function updateVocabStats() {
  const total = vocab.words.length;
  const known = vocab.words.filter((w) => w.status === "known").length;
  const review = vocab.words.filter((w) => w.status === "review").length;
  const unsure = vocab.words.filter((w) => w.status === "unsure").length;
  document.getElementById("vocabStats").innerHTML =
    `<span><b>${total}</b> total</span><span><b>${known}</b> mastered</span><span><b>${review}</b> review</span><span><b>${unsure}</b> learning</span>`;
  document.getElementById("unsureCount").textContent = unsure + review;
}

function filteredWords() {
  return vocab.words.filter((w) => {
    if (vocab.filter !== "all" && w.status !== vocab.filter) return false;
    if (vocab.groupFilter && w.groupId !== vocab.groupFilter) return false;
    if (vocab.search) {
      const group = vocab.groups[w.groupId];
      const inTerm = w.term.toLowerCase().includes(vocab.search);
      const inPron = (w.pronunciation || "")
        .toLowerCase()
        .includes(vocab.search);
      const inMeaning = w.meanings.some(
        (m) =>
          (m.definition || "").toLowerCase().includes(vocab.search) ||
          (m.explain || "").toLowerCase().includes(vocab.search),
      );
      const inGroup =
        group &&
        (group.name.toLowerCase().includes(vocab.search) ||
          group.meaning.toLowerCase().includes(vocab.search));
      if (!inTerm && !inPron && !inMeaning && !inGroup) return false;
    }
    return true;
  });
}

function renderWordList() {
  const list = document.getElementById("wordList");
  const empty = document.getElementById("wordEmpty");
  const items = filteredWords();
  list.innerHTML = "";

  if (vocab.words.length === 0) {
    empty.style.display = "block";
    empty.querySelector("p").textContent =
      'No words added yet. Click "+ Add Word" or "Discover Words" to build your vocabulary.';
    return;
  }
  if (items.length === 0) {
    empty.style.display = "block";
    empty.querySelector("p").textContent = "No matching words found.";
    return;
  }
  empty.style.display = "none";

  items.forEach((word) => list.appendChild(buildWordCard(word)));
}

function buildWordCard(word) {
  const card = document.createElement("div");
  card.className = "word-card";
  card.dataset.id = word.id;

  const group = vocab.groups[word.groupId];
  const groupTag = group
    ? `<span class="group-tag">${escapeHtml(group.name)}</span>`
    : "";
  const preview = word.meanings[0]?.definition || "";

  const head = document.createElement("div");
  head.className = "word-card-head";
  head.innerHTML = `
    <span class="word-status-dot ${word.status}"></span>
    <div class="word-head-text">
      <div class="word-card-head-top">
        <span class="word-term">${escapeHtml(word.term)}</span>
        ${word.pronunciation ? `<span class="word-pron">${escapeHtml(word.pronunciation)}</span>` : ""}
      </div>
      <div class="word-preview">${escapeHtml(preview)}</div>
    </div>
    ${groupTag}
  `;

  head
    .querySelector(".word-card-head-top")
    .appendChild(buildSpeakButtons(word.term));
  head
    .querySelector(".word-status-dot")
    .after(makeWordImg("word-thumb", word.term));

  const body = document.createElement("div");
  body.className = "word-card-body";
  body.innerHTML = word.meanings
    .map(
      (m) => `
    <div class="meaning-item">
      <div class="meaning-def">${escapeHtml(m.definition)}</div>
      ${m.explain ? `<div class="meaning-explain">${escapeHtml(m.explain)}</div>` : ""}
      ${m.example ? `<div class="meaning-example">"${escapeHtml(m.example)}"</div>` : ""}
    </div>
  `,
    )
    .join("");
  body.prepend(makeWordImg("word-hero", word.term));

  const actions = document.createElement("div");
  actions.className = "word-card-actions";

  const statusSeg = document.createElement("div");
  statusSeg.className = "status-seg";
  STATUS_ORDER.forEach((st) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `status-seg-btn status-${st}-btn${word.status === st ? " active" : ""}`;
    btn.textContent = statusLabel[st];
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (word.status !== st) setWordStatus(word.id, st);
    });
    statusSeg.appendChild(btn);
  });

  const editBtn = document.createElement("button");
  editBtn.className = "btn btn-ghost";
  editBtn.textContent = "Edit";
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openWordModal(word);
  });

  actions.appendChild(statusSeg);
  actions.appendChild(editBtn);
  body.appendChild(actions);

  head.addEventListener("click", () => body.classList.toggle("open"));

  card.appendChild(head);
  card.appendChild(body);
  applyWordImage(card, word.imageUrl);
  return card;
}

async function setWordStatus(id, status) {
  const res = await api(`/api/words/${id}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (res.ok) loadWords();
}

function openWordModal(word) {
  vocab.editingId = word ? word.id : null;
  document.getElementById("wordModalTitle").textContent = word
    ? "Edit Word"
    : "Add New Word";
  document.getElementById("wordTermInput").value = word ? word.term : "";
  document.getElementById("wordPronInput").value = word
    ? word.pronunciation || ""
    : "";
  document.getElementById("wordGroupInput").value = word
    ? word.groupId || ""
    : "";
  document.getElementById("wordDelete").style.display = word ? "block" : "none";

  const list = document.getElementById("meaningsList");
  list.innerHTML = "";
  if (word && word.meanings.length > 0) {
    word.meanings.forEach((m) => addMeaningRow(m));
  } else {
    addMeaningRow();
  }

  document.getElementById("wordOverlay").classList.add("show");
  document.getElementById("wordModal").classList.add("show");
  document.getElementById("wordTermInput").focus();
}

function closeWordModal() {
  document.getElementById("wordOverlay").classList.remove("show");
  document.getElementById("wordModal").classList.remove("show");
}

function addMeaningRow(data) {
  const list = document.getElementById("meaningsList");
  const row = document.createElement("div");
  row.className = "meaning-row";

  row.innerHTML = `
    <div class="meaning-row-top">
      <span class="field-label-inline" style="margin:0;">Definition</span>
      <button type="button" class="remove-meaning" title="Remove definition">✕</button>
    </div>
    <input type="text" class="m-def" placeholder="Definition / Meaning" value="${data ? escapeAttr(data.definition) : ""}">
    <input type="text" class="m-explain" placeholder="English Explanation (optional)" value="${data ? escapeAttr(data.explain || "") : ""}">
    <input type="text" class="m-ex" placeholder="Example Sentence (optional)" value="${data ? escapeAttr(data.example || "") : ""}">
  `;

  row.querySelector(".remove-meaning").addEventListener("click", () => {
    if (list.children.length > 1) row.remove();
  });

  list.appendChild(row);
}

async function saveWord() {
  const term = document.getElementById("wordTermInput").value;
  const pronunciation = document.getElementById("wordPronInput").value;
  const groupId = document.getElementById("wordGroupInput").value || null;

  if (!term.trim()) {
    document.getElementById("wordTermInput").focus();
    return;
  }

  const meanings = [...document.querySelectorAll(".meaning-row")]
    .map((row) => ({
      definition: row.querySelector(".m-def").value,
      explain: row.querySelector(".m-explain").value,
      example: row.querySelector(".m-ex").value,
    }))
    .filter((m) => m.definition.trim());

  if (meanings.length === 0) {
    alert("At least 1 non-empty definition is required.");
    return;
  }

  const url = vocab.editingId ? `/api/words/${vocab.editingId}` : "/api/words";
  const method = vocab.editingId ? "PUT" : "POST";

  const res = await api(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ term, pronunciation, groupId, meanings }),
  });
  if (res.ok) {
    closeWordModal();
    loadWords();
  }
}

async function deleteWord() {
  if (!vocab.editingId) return;
  if (!confirm("Delete this word from your vocabulary list?")) return;
  const res = await api(`/api/words/${vocab.editingId}`, {
    method: "DELETE",
  });
  if (res.ok) {
    closeWordModal();
    loadWords();
  }
}
