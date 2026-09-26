const state = {
  year: null,
  month: null, // 1-12
  today: null,
  activeDate: null,
  currentDay: null, // last fetched /api/day response
};

const monthLabel = document.getElementById("monthLabel");
const calendarGrid = document.getElementById("calendarGrid");
const overlay = document.getElementById("overlay");
const dayPanel = document.getElementById("dayPanel");
const panelBody = document.getElementById("panelBody");

function init() {
  const now = new Date();
  state.year = now.getFullYear();
  state.month = now.getMonth() + 1;
  loadMonth();

  document
    .getElementById("prevMonth")
    .addEventListener("click", () => shiftMonth(-1));
  document
    .getElementById("nextMonth")
    .addEventListener("click", () => shiftMonth(1));
  document.getElementById("closePanel").addEventListener("click", closePanel);
  overlay.addEventListener("click", closePanel);

  document
    .getElementById("settingsBtn")
    .addEventListener("click", openSettings);
  document
    .getElementById("settingsCancel")
    .addEventListener("click", closeSettings);
  document
    .getElementById("settingsOverlay")
    .addEventListener("click", closeSettings);
  document
    .getElementById("settingsSave")
    .addEventListener("click", saveSettings);
  document
    .getElementById("addReviewInterval")
    .addEventListener("click", () => addReviewIntervalRow(3));

  initTabs();
  initVocab();
  initChecklist();
}

// ---------- Tabs ----------

function initTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".tab-panel")
        .forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
      if (btn.dataset.tab === "vocab") loadWords();
      if (btn.dataset.tab === "checklist") loadChecklists();
    });
  });
}

function shiftMonth(delta) {
  state.month += delta;
  if (state.month > 12) {
    state.month = 1;
    state.year++;
  }
  if (state.month < 1) {
    state.month = 12;
    state.year--;
  }
  loadMonth();
}

async function loadMonth() {
  const monthNames = [
    "Tháng 1",
    "Tháng 2",
    "Tháng 3",
    "Tháng 4",
    "Tháng 5",
    "Tháng 6",
    "Tháng 7",
    "Tháng 8",
    "Tháng 9",
    "Tháng 10",
    "Tháng 11",
    "Tháng 12",
  ];
  monthLabel.textContent = `${monthNames[state.month - 1]}, ${state.year}`;

  const res = await fetch(`/api/month/${state.year}/${state.month}`);
  const data = await res.json();
  state.today = data.today;
  renderCalendar(data.days);
}

function renderCalendar(days) {
  calendarGrid.innerHTML = "";
  if (days.length === 0) return;

  // Monday-first offset
  const firstDate = new Date(state.year, state.month - 1, 1);
  let offset = firstDate.getDay() - 1; // 0=Mon
  if (offset < 0) offset = 6;

  for (let i = 0; i < offset; i++) {
    const empty = document.createElement("div");
    empty.className = "day-cell empty";
    calendarGrid.appendChild(empty);
  }

  days.forEach((d) => {
    const cell = document.createElement("div");
    const dayNum = parseInt(d.date.split("-")[2], 10);
    cell.className = `day-cell ${d.status}`;
    cell.innerHTML = `<span>${dayNum}</span>`;

    if (d.status !== "future") {
      cell.addEventListener("click", () => openPanel(d.date));
    }

    if (d.status === "complete" || d.status === "incomplete") {
      const mark = document.createElement("span");
      mark.className = `status-mark ${d.status}`;
      mark.textContent = d.status === "complete" ? "✓" : "✕";
      cell.appendChild(mark);
    }

    if (d.difficulty) {
      const dot = document.createElement("span");
      dot.className = `diff-dot ${d.difficulty}`;
      cell.appendChild(dot);
    }

    if (d.starred) {
      const star = document.createElement("span");
      star.className = "star-mark";
      star.textContent = "★";
      cell.appendChild(star);
    }

    calendarGrid.appendChild(cell);
  });
}

// ---------- Day panel ----------

async function openPanel(date) {
  state.activeDate = date;
  const res = await fetch(`/api/day/${date}`);
  const data = await res.json();
  state.currentDay = data;
  renderPanel(data);

  overlay.classList.add("show");
  dayPanel.classList.add("show");
}

function closePanel() {
  overlay.classList.remove("show");
  dayPanel.classList.remove("show");
}

function toggleExpandEl(el) {
  const isOpen = el.classList.contains("open");
  document
    .querySelectorAll(".task-expand")
    .forEach((e) => e.classList.remove("open"));
  if (!isOpen) el.classList.add("open");
}

function fmtDateVN(dateStr) {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

const diffLabel = { easy: "Dễ", medium: "Trung bình", hard: "Khó" };

function renderPanel(data) {
  document.getElementById("panelDate").textContent = fmtDateVN(data.date);
  document.getElementById("panelSub").textContent = data.isToday
    ? "Hôm nay"
    : "Ngày trong quá khứ — vẫn có thể sửa";

  panelBody.innerHTML = "";

  if (data.newProblems.length > 0) {
    panelBody.appendChild(sectionTitle("Bài mới"));
    data.newProblems.forEach((problem, i) => {
      panelBody.appendChild(buildNewCard(i, problem));
    });
  }

  panelBody.appendChild(sectionTitle("Ôn lại (theo lịch)"));
  panelBody.appendChild(buildReviewCard(data.reviews));

  panelBody.appendChild(sectionTitle("Bài ngẫu nhiên"));
  panelBody.appendChild(buildRandomCard(data.randoms));
}

function sectionTitle(text) {
  const el = document.createElement("div");
  el.className = "panel-section-title";
  el.textContent = text;
  return el;
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

// ----- "Bài mới" cards (one editable card per slot) -----

function buildNewCard(index, problem) {
  const card = document.createElement("div");
  card.className = "task-card";

  const bar = document.createElement("div");
  bar.className = "task-bar";
  const preview = problem
    ? `${problem.name} · ${diffLabel[problem.difficulty]}`
    : "Chưa có bài — bấm để thêm";
  bar.innerHTML = `
    <span class="task-icon">①</span>
    <div class="task-bar-text">
      <div class="task-title">Bài mới #${index + 1}</div>
      <div class="task-preview">${escapeHtml(preview)}</div>
    </div>
    <span class="task-status">${problem && problem.completed ? "✅" : ""}</span>
  `;

  const expand = document.createElement("div");
  expand.className = "task-expand";
  expand.innerHTML = `
    <label>Tên bài</label>
    <input type="text" class="new-name" placeholder="VD: Two Sum" value="${problem ? escapeAttr(problem.name) : ""}">
    <label>Độ khó</label>
    <div class="seg new-difficulty">
      <button type="button" data-val="easy" class="seg-btn diff-easy-btn">Dễ</button>
      <button type="button" data-val="medium" class="seg-btn diff-medium-btn">Trung bình</button>
      <button type="button" data-val="hard" class="seg-btn diff-hard-btn">Khó</button>
    </div>
    <button type="button" class="star-toggle new-star">☆ Đánh dấu sao</button>
    <label>Ghi chú</label>
    <textarea class="new-note" rows="3" placeholder="Ý tưởng, cách giải, độ phức tạp...">${problem ? escapeHtml(problem.note || "") : ""}</textarea>
    <div class="task-actions">
      <button class="btn btn-secondary new-save">Lưu</button>
      <button class="btn btn-primary new-complete">${problem && problem.completed ? "Bỏ đánh dấu hoàn thành" : "Đánh dấu hoàn thành"}</button>
    </div>
  `;

  const diffVal = problem ? problem.difficulty : "medium";
  expand.querySelectorAll(".new-difficulty .seg-btn").forEach((b) => {
    if (b.dataset.val === diffVal) b.classList.add("active");
    b.addEventListener("click", () => {
      expand
        .querySelectorAll(".new-difficulty .seg-btn")
        .forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
    });
  });

  const starBtn = expand.querySelector(".new-star");
  if (problem && problem.starred) {
    starBtn.classList.add("active");
    starBtn.textContent = "★ Đã đánh dấu sao";
  }
  starBtn.addEventListener("click", () => {
    starBtn.classList.toggle("active");
    starBtn.textContent = starBtn.classList.contains("active")
      ? "★ Đã đánh dấu sao"
      : "☆ Đánh dấu sao";
  });

  expand
    .querySelector(".new-save")
    .addEventListener("click", () => saveNewProblem(index, expand));
  expand
    .querySelector(".new-complete")
    .addEventListener("click", () => toggleNewComplete(index));

  bar.addEventListener("click", () => toggleExpandEl(expand));

  card.appendChild(bar);
  card.appendChild(expand);
  return card;
}

async function saveNewProblem(index, expand) {
  const nameInput = expand.querySelector(".new-name");
  const name = nameInput.value;
  const activeSeg = expand.querySelector(".new-difficulty .seg-btn.active");
  const difficulty = activeSeg ? activeSeg.dataset.val : "medium";
  const starred = expand
    .querySelector(".new-star")
    .classList.contains("active");
  const note = expand.querySelector(".new-note").value;

  if (!name.trim()) {
    nameInput.focus();
    return;
  }

  const res = await fetch(`/api/day/${state.activeDate}/new/${index}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, difficulty, starred, note }),
  });
  if (res.ok) {
    await refreshPanel();
    await loadMonth();
  }
}

async function toggleNewComplete(index) {
  const res = await fetch(
    `/api/day/${state.activeDate}/new/${index}/complete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  if (res.ok) {
    await refreshPanel();
    await loadMonth();
  }
}

// ----- "Ôn lại" — single card, list of items inside -----

function buildReviewCard(reviews) {
  const card = document.createElement("div");
  card.className = "task-card";
  card.id = "task-review";

  const withProblem = reviews.filter((r) => r.problem);
  const doneCount = withProblem.filter((r) => r.completed).length;

  const bar = document.createElement("div");
  bar.className = "task-bar";
  const preview =
    withProblem.length > 0
      ? `${doneCount}/${withProblem.length} đã xong`
      : "Chưa có bài để ôn (chưa đủ dữ liệu lịch sử)";
  bar.innerHTML = `
    <span class="task-icon">②</span>
    <div class="task-bar-text">
      <div class="task-title">Ôn lại (theo lịch)</div>
      <div class="task-preview">${escapeHtml(preview)}</div>
    </div>
    <span class="task-status">${withProblem.length > 0 && doneCount === withProblem.length ? "✅" : ""}</span>
  `;

  const expand = document.createElement("div");
  expand.className = "task-expand";
  const list = document.createElement("div");
  list.className = "review-items";

  if (reviews.length === 0) {
    list.innerHTML = `<div class="review-item-empty">Chưa có vòng ôn tập nào được cấu hình.</div>`;
  } else {
    reviews.forEach((review, i) => {
      list.appendChild(buildReviewRow(review, i));
    });
  }

  expand.appendChild(list);
  bar.addEventListener("click", () => toggleExpandEl(expand));

  card.appendChild(bar);
  card.appendChild(expand);
  return card;
}

function buildReviewRow(review, index) {
  const row = document.createElement("div");
  row.className = "review-item-row";

  if (!review.problem) {
    row.innerHTML = `
      <div class="review-item-info">
        <div class="review-item-empty">Chưa có bài nào được tạo đúng ${review.intervalDays} ngày trước để ôn lại.</div>
      </div>
    `;
    return row;
  }

  const p = review.problem;
  row.innerHTML = `
    <div class="review-item-info">
      <div class="r-name">${escapeHtml(p.name)} ${p.starred ? "★" : ""}</div>
      <div class="r-meta">${diffLabel[p.difficulty]} · làm ngày ${fmtDateVN(p.date)} · ôn ${review.intervalDays} ngày trước</div>
      ${p.note ? `<div class="r-note">${escapeHtml(p.note)}</div>` : ""}
    </div>
    <div class="review-item-actions">
      <button class="btn btn-primary review-item-complete">${review.completed ? "Bỏ đánh dấu" : "Hoàn thành"}</button>
    </div>
  `;
  row
    .querySelector(".review-item-complete")
    .addEventListener("click", () => toggleReviewComplete(index));
  return row;
}

async function toggleReviewComplete(index) {
  const res = await fetch(
    `/api/day/${state.activeDate}/review/${index}/complete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  if (res.ok) {
    await refreshPanel();
    await loadMonth();
  }
}

// ----- "Bài ngẫu nhiên" — single card, list of items inside -----

function buildRandomCard(randoms) {
  const card = document.createElement("div");
  card.className = "task-card";
  card.id = "task-random";

  const withProblem = randoms.filter((r) => r.problem);
  const doneCount = withProblem.filter((r) => r.completed).length;

  const bar = document.createElement("div");
  bar.className = "task-bar";
  const preview =
    withProblem.length > 0
      ? `${doneCount}/${withProblem.length} đã xong`
      : "Chưa có bài cũ nào trong kho";
  bar.innerHTML = `
    <span class="task-icon">③</span>
    <div class="task-bar-text">
      <div class="task-title">Bài ngẫu nhiên</div>
      <div class="task-preview">${escapeHtml(preview)}</div>
    </div>
    <span class="task-status">${withProblem.length > 0 && doneCount === withProblem.length ? "✅" : ""}</span>
  `;

  const expand = document.createElement("div");
  expand.className = "task-expand";
  const list = document.createElement("div");
  list.className = "review-items";

  if (randoms.length === 0) {
    list.innerHTML = `<div class="review-item-empty">Chưa có bài random nào được cấu hình.</div>`;
  } else {
    randoms.forEach((random, i) => {
      list.appendChild(buildRandomRow(random, i));
    });
  }

  expand.appendChild(list);
  bar.addEventListener("click", () => toggleExpandEl(expand));

  card.appendChild(bar);
  card.appendChild(expand);
  return card;
}

function buildRandomRow(random, index) {
  const row = document.createElement("div");
  row.className = "review-item-row";

  if (!random.problem) {
    row.innerHTML = `
      <div class="review-item-info">
        <div class="review-item-empty">Chưa có bài nào trong quá khứ để random.</div>
      </div>
    `;
    return row;
  }

  const p = random.problem;
  row.innerHTML = `
    <div class="review-item-info">
      <div class="r-name">${escapeHtml(p.name)} ${p.starred ? "★" : ""}</div>
      <div class="r-meta">${diffLabel[p.difficulty]} · lần đầu làm ngày ${fmtDateVN(p.date)}</div>
      ${p.note ? `<div class="r-note">${escapeHtml(p.note)}</div>` : ""}
    </div>
    <div class="review-item-actions">
      <button class="btn btn-ghost random-item-reroll" title="Đổi bài khác">🎲</button>
      <button class="btn btn-primary random-item-complete">${random.completed ? "Bỏ đánh dấu" : "Hoàn thành"}</button>
    </div>
  `;
  row
    .querySelector(".random-item-complete")
    .addEventListener("click", () => toggleRandomComplete(index));
  row
    .querySelector(".random-item-reroll")
    .addEventListener("click", () => rerollRandom(index));
  return row;
}

async function toggleRandomComplete(index) {
  const res = await fetch(
    `/api/day/${state.activeDate}/random/${index}/complete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  if (res.ok) {
    await refreshPanel();
    await loadMonth();
  }
}

async function rerollRandom(index) {
  const res = await fetch(
    `/api/day/${state.activeDate}/random/${index}/reroll`,
    { method: "POST" },
  );
  if (res.ok) {
    await refreshPanel();
    await loadMonth();
  }
}

async function refreshPanel() {
  const res = await fetch(`/api/day/${state.activeDate}`);
  const data = await res.json();
  state.currentDay = data;
  renderPanel(data);
}

// ---------- Settings ----------

function addReviewIntervalRow(value) {
  const list = document.getElementById("reviewIntervalsList");
  const row = document.createElement("div");
  row.className = "review-interval-row";
  row.innerHTML = `
    <input type="number" class="review-interval-input" min="1" value="${value !== undefined ? value : 3}">
    <span class="review-interval-suffix">ngày trước</span>
    <button type="button" class="remove-review-interval" title="Xóa vòng ôn tập này">✕</button>
  `;
  row.querySelector(".remove-review-interval").addEventListener("click", () => {
    if (list.children.length > 1) row.remove();
  });
  list.appendChild(row);
}

async function openSettings() {
  const res = await fetch("/api/settings");
  const settings = await res.json();

  document.getElementById("newCountInput").value = settings.newCount;
  document.getElementById("randomCountInput").value = settings.randomCount;

  const list = document.getElementById("reviewIntervalsList");
  list.innerHTML = "";
  const intervals =
    settings.reviewIntervals && settings.reviewIntervals.length > 0
      ? settings.reviewIntervals
      : [3];
  intervals.forEach((v) => addReviewIntervalRow(v));

  document.getElementById("settingsOverlay").classList.add("show");
  document.getElementById("settingsModal").classList.add("show");
}

function closeSettings() {
  document.getElementById("settingsOverlay").classList.remove("show");
  document.getElementById("settingsModal").classList.remove("show");
}

async function saveSettings() {
  const newCount = parseInt(document.getElementById("newCountInput").value, 10);
  const randomCount = parseInt(
    document.getElementById("randomCountInput").value,
    10,
  );
  const reviewIntervals = [
    ...document.querySelectorAll(".review-interval-input"),
  ]
    .map((inp) => parseInt(inp.value, 10))
    .filter((n) => n > 0);

  if (isNaN(newCount) || newCount < 0) {
    alert("Số bài mới mỗi ngày không hợp lệ.");
    return;
  }
  if (isNaN(randomCount) || randomCount < 0) {
    alert("Số bài ngẫu nhiên mỗi ngày không hợp lệ.");
    return;
  }
  if (reviewIntervals.length === 0) {
    alert("Cần ít nhất 1 vòng ôn tập hợp lệ (số ngày > 0).");
    return;
  }

  await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newCount, reviewIntervals, randomCount }),
  });
  closeSettings();
  loadMonth();
}

// ===================== Vocabulary =====================

// 3 trạng thái cho mỗi từ:
// - unsure: chưa nhớ
// - review: đã học nhưng chưa chắc lắm, cần kiểm tra lại
// - known:  đã nhớ chắc
const statusLabel = {
  known: "Đã biết",
  review: "Kiểm tra lại",
  unsure: "Chưa nhớ",
};
const STATUS_ORDER = ["unsure", "review", "known"];

const vocab = {
  words: [],
  groups: {}, // id -> group object
  groupList: [], // sorted array of groups
  filter: "all",
  groupFilter: "",
  search: "",
  editingId: null,
};

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

  document
    .getElementById("testModeBtn")
    .addEventListener("click", openTestSetup);
  document
    .getElementById("testSetupCancel")
    .addEventListener("click", closeTestSetup);
  document
    .getElementById("testSetupOverlay")
    .addEventListener("click", closeTestSetup);
  document
    .getElementById("testSetupStart")
    .addEventListener("click", startTestFromSetup);

  document
    .getElementById("quizModeBtn")
    .addEventListener("click", openQuizSetup);
  document
    .getElementById("quizSetupCancel")
    .addEventListener("click", closeQuizSetup);
  document
    .getElementById("quizSetupOverlay")
    .addEventListener("click", closeQuizSetup);
  document
    .getElementById("quizSetupStart")
    .addEventListener("click", startQuizFromSetup);
  document
    .querySelectorAll('input[name="quizSetupStatus"]')
    .forEach((r) => r.addEventListener("change", updateQuizSetupHint));
  document.getElementById("quizClose").addEventListener("click", closeQuizMode);
  document
    .getElementById("quizOverlay")
    .addEventListener("click", closeQuizMode);
  document
    .getElementById("quizDoneClose")
    .addEventListener("click", closeQuizMode);

  document.getElementById("testClose").addEventListener("click", closeTestMode);
  document
    .getElementById("testOverlay")
    .addEventListener("click", closeTestMode);
  document.getElementById("flashcard").addEventListener("click", flipCard);
  document
    .getElementById("testKnown")
    .addEventListener("click", () => answerCard("known"));
  document
    .getElementById("testReview")
    .addEventListener("click", () => answerCard("review"));
  document
    .getElementById("testStillUnsure")
    .addEventListener("click", () => answerCard("unsure"));
  document
    .getElementById("testDoneClose")
    .addEventListener("click", closeTestMode);

  loadGroups();
  loadWords();
}

async function loadGroups() {
  const res = await fetch("/api/groups");
  const groups = await res.json();
  vocab.groupList = groups;
  vocab.groups = {};
  groups.forEach((g) => {
    vocab.groups[g.id] = g;
  });

  // populate group filter dropdown
  const filterSelect = document.getElementById("vocabGroupFilter");
  filterSelect.innerHTML =
    '<option value="">Tất cả chủ đề</option>' +
    groups
      .map(
        (g) =>
          `<option value="${g.id}">${escapeHtml(g.name)} — ${escapeHtml(g.meaning)}</option>`,
      )
      .join("");

  // populate add/edit word group select
  const wordGroupSelect = document.getElementById("wordGroupInput");
  wordGroupSelect.innerHTML =
    '<option value="">Không thuộc chủ đề nào</option>' +
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

async function loadWords() {
  const res = await fetch("/api/words");
  vocab.words = await res.json();
  renderWordList();
  updateVocabStats();
}

function updateVocabStats() {
  const total = vocab.words.length;
  const known = vocab.words.filter((w) => w.status === "known").length;
  const review = vocab.words.filter((w) => w.status === "review").length;
  const unsure = vocab.words.filter((w) => w.status === "unsure").length;
  document.getElementById("vocabStats").innerHTML =
    `<span><b>${total}</b> từ</span><span><b>${known}</b> đã biết</span><span><b>${review}</b> kiểm tra lại</span><span><b>${unsure}</b> chưa nhớ</span>`;
  // badge trên nút "Kiểm tra" = số từ chưa chắc chắn (chưa nhớ + kiểm tra lại)
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
      'Chưa có từ nào. Bấm "+ Thêm từ" để bắt đầu xây kho từ vựng của bạn.';
    return;
  }
  if (items.length === 0) {
    empty.style.display = "block";
    empty.querySelector("p").textContent = "Không tìm thấy từ nào phù hợp.";
    return;
  }
  empty.style.display = "none";

  items.forEach((word) => list.appendChild(buildWordCard(word)));
}

function buildWordCard(word) {
  const card = document.createElement("div");
  card.className = "word-card";

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

  const actions = document.createElement("div");
  actions.className = "word-card-actions";

  // Chọn trạng thái trực tiếp: Chưa nhớ / Kiểm tra lại / Đã biết
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
  editBtn.textContent = "Sửa";
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
  return card;
}

async function setWordStatus(id, status) {
  const res = await fetch(`/api/words/${id}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (res.ok) loadWords();
}

// ---------- Add / edit word modal ----------

function openWordModal(word) {
  vocab.editingId = word ? word.id : null;
  document.getElementById("wordModalTitle").textContent = word
    ? "Sửa từ"
    : "Thêm từ mới";
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
      <span class="field-label-inline" style="margin:0;">Nghĩa tiếng Việt</span>
      <button type="button" class="remove-meaning" title="Xóa nghĩa này">✕</button>
    </div>
    <input type="text" class="m-def" placeholder="Nghĩa tiếng Việt" value="${data ? escapeAttr(data.definition) : ""}">
    <input type="text" class="m-explain" placeholder="Giải thích tiếng Anh (tuỳ chọn)" value="${data ? escapeAttr(data.explain || "") : ""}">
    <input type="text" class="m-ex" placeholder="Ví dụ (tuỳ chọn)" value="${data ? escapeAttr(data.example || "") : ""}">
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
    alert("Cần ít nhất 1 nghĩa có nội dung.");
    return;
  }

  const url = vocab.editingId ? `/api/words/${vocab.editingId}` : "/api/words";
  const method = vocab.editingId ? "PUT" : "POST";

  const res = await fetch(url, {
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
  if (!confirm("Xóa từ này khỏi kho từ vựng?")) return;
  const res = await fetch(`/api/words/${vocab.editingId}`, {
    method: "DELETE",
  });
  if (res.ok) {
    closeWordModal();
    loadWords();
  }
}

// ---------- Test setup (choose which pools to test) ----------

function poolFor(statuses) {
  return vocab.words.filter(
    (w) =>
      statuses.includes(w.status) &&
      (!vocab.groupFilter || w.groupId === vocab.groupFilter),
  );
}

function openTestSetup() {
  document.getElementById("testSetupUnsureCount").textContent = poolFor([
    "unsure",
  ]).length;
  document.getElementById("testSetupReviewCount").textContent = poolFor([
    "review",
  ]).length;
  document.getElementById("testSetupKnownCount").textContent = poolFor([
    "known",
  ]).length;

  document.getElementById("testSetupHint").textContent = vocab.groupFilter
    ? `Chỉ tính từ trong chủ đề đang lọc: ${groupLabel(vocab.groupFilter)}`
    : "Tính trên toàn bộ kho từ vựng (không lọc theo chủ đề).";

  // mặc định chọn sẵn "Chưa nhớ" + "Kiểm tra lại", bỏ "Đã biết"
  document.getElementById("testSetupUnsure").checked = true;
  document.getElementById("testSetupReview").checked = true;
  document.getElementById("testSetupKnown").checked = false;

  document.getElementById("testSetupOverlay").classList.add("show");
  document.getElementById("testSetupModal").classList.add("show");
}

function closeTestSetup() {
  document.getElementById("testSetupOverlay").classList.remove("show");
  document.getElementById("testSetupModal").classList.remove("show");
}

function startTestFromSetup() {
  const statuses = [];
  if (document.getElementById("testSetupUnsure").checked)
    statuses.push("unsure");
  if (document.getElementById("testSetupReview").checked)
    statuses.push("review");
  if (document.getElementById("testSetupKnown").checked) statuses.push("known");

  if (statuses.length === 0) {
    alert("Chọn ít nhất 1 nhóm để kiểm tra.");
    return;
  }

  closeTestSetup();
  openTestMode(statuses);
}

// ---------- Test mode (flashcards) ----------

const testState = { queue: [], index: 0, known: 0, review: 0, stillUnsure: 0 };

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function openTestMode(statuses) {
  // test mode respects the current group filter (if any) so the user can drill one topic at a time
  testState.queue = shuffle(poolFor(statuses));
  testState.index = 0;
  testState.known = 0;
  testState.review = 0;
  testState.stillUnsure = 0;

  document.getElementById("testOverlay").classList.add("show");
  document.getElementById("testStage").classList.add("show");
  document.getElementById("testDone").style.display = "none";
  document.getElementById("testBody").style.display = "block";
  document.getElementById("testActions").style.display = "flex";

  if (testState.queue.length === 0) {
    document.getElementById("testBody").style.display = "none";
    document.getElementById("testActions").style.display = "none";
    document.getElementById("testDone").style.display = "block";
    document.getElementById("testProgress").textContent = "0 / 0";
    document.getElementById("testDoneSummary").textContent =
      "Không có từ nào trong (các) nhóm bạn đã chọn. Hãy chọn nhóm khác hoặc thêm từ mới!";
    return;
  }
  renderTestCard();
}

function renderTestCard() {
  const w = testState.queue[testState.index];
  const group = vocab.groups[w.groupId];
  document.getElementById("testProgress").textContent =
    `${testState.index + 1} / ${testState.queue.length}`;
  document.getElementById("fcTerm").textContent = w.term;
  document.getElementById("fcTermSmall").textContent =
    w.term + (w.pronunciation ? ` ${w.pronunciation}` : "");
  document.getElementById("fcMeanings").innerHTML =
    (group
      ? `<div class="group-tag" style="margin-bottom:8px;display:inline-flex;">${escapeHtml(group.name)} · ${escapeHtml(group.meaning)}</div>`
      : "") +
    w.meanings
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
  document.getElementById("flashcardInner").classList.remove("flipped");
}

function flipCard() {
  document.getElementById("flashcardInner").classList.toggle("flipped");
}

async function answerCard(result) {
  const w = testState.queue[testState.index];
  await fetch(`/api/words/${w.id}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: result }),
  });
  if (result === "known") testState.known++;
  else if (result === "review") testState.review++;
  else testState.stillUnsure++;

  testState.index++;
  if (testState.index >= testState.queue.length) {
    document.getElementById("testBody").style.display = "none";
    document.getElementById("testActions").style.display = "none";
    document.getElementById("testDone").style.display = "block";
    document.getElementById("testDoneSummary").textContent =
      `Đã nhớ: ${testState.known} từ · Kiểm tra lại: ${testState.review} từ · Chưa nhớ: ${testState.stillUnsure} từ`;
  } else {
    renderTestCard();
  }
}

function closeTestMode() {
  document.getElementById("testOverlay").classList.remove("show");
  document.getElementById("testStage").classList.remove("show");
  loadWords();
}

// ---------- Quiz mode (trắc nghiệm 4 đáp án) ----------
// Khác với "Kiểm tra" (flashcard) ở trên: chế độ này KHÔNG bao giờ đổi
// trạng thái known/review/unsure của từ. Nó chỉ là một vòng luyện tập:
// - Chọn 1 trong 3 nhóm (chưa nhớ / kiểm tra lại / đã biết) + số lượng từ.
// - Mỗi từ hiện ra kèm 4 đáp án tiếng Việt (1 đúng, 3 lấy random từ các từ khác).
// - Trả lời đúng -> từ bị loại khỏi hàng đợi (không đổi trạng thái).
// - Trả lời sai -> từ được chèn lại vào hàng đợi ở một vị trí ngẫu nhiên để hỏi lại.
const quizState = { queue: [], total: 0, mistakes: 0 };

function openQuizSetup() {
  document.getElementById("quizSetupUnsureCount").textContent = poolFor([
    "unsure",
  ]).length;
  document.getElementById("quizSetupReviewCount").textContent = poolFor([
    "review",
  ]).length;
  document.getElementById("quizSetupKnownCount").textContent = poolFor([
    "known",
  ]).length;

  document.querySelector(
    'input[name="quizSetupStatus"][value="unsure"]',
  ).checked = true;
  updateQuizSetupHint();

  document.getElementById("quizSetupOverlay").classList.add("show");
  document.getElementById("quizSetupModal").classList.add("show");
}

function closeQuizSetup() {
  document.getElementById("quizSetupOverlay").classList.remove("show");
  document.getElementById("quizSetupModal").classList.remove("show");
}

function updateQuizSetupHint() {
  const checked = document.querySelector(
    'input[name="quizSetupStatus"]:checked',
  );
  const status = checked ? checked.value : "unsure";
  const available = poolFor([status]).length;

  const countInput = document.getElementById("quizSetupCount");
  countInput.max = available > 0 ? available : 1;
  countInput.value = Math.max(1, Math.min(10, available || 1));

  let hint =
    available > 0
      ? `Nhóm "${statusLabel[status]}" hiện có ${available} từ.`
      : `Nhóm "${statusLabel[status]}" chưa có từ nào.`;
  if (vocab.groupFilter) {
    hint += ` (chỉ tính trong chủ đề đang lọc: ${groupLabel(vocab.groupFilter)})`;
  }
  document.getElementById("quizSetupHint").textContent = hint;
}

function startQuizFromSetup() {
  const checked = document.querySelector(
    'input[name="quizSetupStatus"]:checked',
  );
  const status = checked ? checked.value : "unsure";
  const pool = poolFor([status]);

  if (pool.length === 0) {
    alert(`Nhóm "${statusLabel[status]}" chưa có từ nào để test.`);
    return;
  }

  let count = parseInt(document.getElementById("quizSetupCount").value, 10);
  if (isNaN(count) || count < 1) count = 1;
  if (count > pool.length) count = pool.length;

  closeQuizSetup();
  openQuizMode(shuffle(pool).slice(0, count));
}

function openQuizMode(words) {
  quizState.queue = [...words];
  quizState.total = quizState.queue.length;
  quizState.mistakes = 0;

  document.getElementById("quizOverlay").classList.add("show");
  document.getElementById("quizStage").classList.add("show");
  document.getElementById("quizDone").style.display = "none";
  document.getElementById("quizBody").style.display = "flex";

  buildQuizQuestion();
}

function closeQuizMode() {
  document.getElementById("quizOverlay").classList.remove("show");
  document.getElementById("quizStage").classList.remove("show");
}

function buildQuizQuestion() {
  const w = quizState.queue[0];
  const correctDef =
    (w.meanings[0] && w.meanings[0].definition) || "(không có nghĩa)";

  // 3 đáp án nhiễu: lấy random từ nghĩa của các từ KHÁC trong toàn bộ kho từ vựng
  const otherWords = vocab.words.filter(
    (x) => x.id !== w.id && x.meanings[0] && x.meanings[0].definition,
  );
  const distractors = shuffle(otherWords).slice(0, 3);

  const options = shuffle([
    { text: correctDef, correct: true },
    ...distractors.map((o) => ({
      text: o.meanings[0].definition,
      correct: false,
    })),
  ]);

  renderQuizQuestion(w, options);
}

function renderQuizQuestion(w, options) {
  document.getElementById("quizProgress").textContent =
    `${quizState.total - quizState.queue.length + 1} / ${quizState.total}`;
  document.getElementById("quizTerm").textContent = w.term;
  document.getElementById("quizTermPron").textContent = w.pronunciation || "";

  const optWrap = document.getElementById("quizOptions");
  optWrap.innerHTML = "";
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quiz-option-btn";
    btn.textContent = opt.text;
    btn.dataset.correct = opt.correct ? "1" : "0";
    btn.addEventListener("click", () =>
      handleQuizAnswer(opt.correct, btn, optWrap),
    );
    optWrap.appendChild(btn);
  });
}

function handleQuizAnswer(isCorrect, clickedBtn, optWrap) {
  const buttons = [...optWrap.querySelectorAll(".quiz-option-btn")];
  buttons.forEach((b) => {
    b.disabled = true;
    if (b.dataset.correct === "1") b.classList.add("correct");
  });
  if (!isCorrect) clickedBtn.classList.add("wrong");

  setTimeout(() => {
    // Luôn bỏ từ hiện tại ra khỏi đầu hàng đợi trước.
    const current = quizState.queue.shift();

    if (isCorrect) {
      // Đúng -> loại hẳn khỏi hàng đợi lần test này. KHÔNG đổi trạng thái từ.
    } else {
      // Sai -> chèn lại vào một vị trí ngẫu nhiên trong phần còn lại của hàng đợi.
      quizState.mistakes++;
      const insertPos = Math.floor(
        Math.random() * (quizState.queue.length + 1),
      );
      quizState.queue.splice(insertPos, 0, current);
    }

    if (quizState.queue.length === 0) {
      showQuizDone();
    } else {
      buildQuizQuestion();
    }
  }, 650);
}

function showQuizDone() {
  document.getElementById("quizBody").style.display = "none";
  document.getElementById("quizDone").style.display = "block";
  document.getElementById("quizProgress").textContent =
    `${quizState.total} / ${quizState.total}`;
  document.getElementById("quizDoneSummary").textContent =
    quizState.mistakes === 0
      ? `Xuất sắc! Bạn trả lời đúng cả ${quizState.total} từ ngay từ lần đầu tiên.`
      : `Đã hoàn thành ${quizState.total} từ, với ${quizState.mistakes} lượt trả lời sai (các từ trả lời sai đã được hỏi lại cho tới khi đúng).`;
}

// ===================== Checklist =====================

const SAMPLE_CHECKLIST_JSON = {
  name: "Chuẩn bị phỏng vấn DSA",
  items: [
    { text: "Ôn lại Big O notation", checked: false },
    { text: "Luyện 5 bài Array/String", checked: true },
    { text: "Luyện 5 bài Linked List", checked: false },
    { text: "Ôn lại kỹ thuật Two Pointers", checked: false },
    { text: "Review CV & chuẩn bị câu hỏi ngược lại", checked: false },
  ],
};

const checklistState = {
  list: [], // summaries: {id, name, createdDate, total, done}
  activeId: null,
  active: null, // full checklist object currently open in panel
};

function initChecklist() {
  document
    .getElementById("newChecklistBtn")
    .addEventListener("click", openNewChecklistModal);
  document
    .getElementById("checklistCancel")
    .addEventListener("click", closeNewChecklistModal);
  document
    .getElementById("checklistOverlay")
    .addEventListener("click", closeNewChecklistModal);
  document
    .getElementById("checklistCreate")
    .addEventListener("click", createChecklist);

  document
    .getElementById("importChecklistBtn")
    .addEventListener("click", openImportModal);
  document
    .getElementById("importCancel")
    .addEventListener("click", closeImportModal);
  document
    .getElementById("importOverlay")
    .addEventListener("click", closeImportModal);
  document
    .getElementById("importSubmit")
    .addEventListener("click", submitImport);
  document
    .getElementById("importFileInput")
    .addEventListener("change", handleImportFile);

  document
    .getElementById("closeChecklistPanel")
    .addEventListener("click", closeChecklistPanel);
  document
    .getElementById("checklistPanelOverlay")
    .addEventListener("click", closeChecklistPanel);
  document
    .getElementById("checklistDelete")
    .addEventListener("click", deleteActiveChecklist);
  document
    .getElementById("addItemBtn")
    .addEventListener("click", addItemToActive);
  document.getElementById("newItemInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addItemToActive();
  });

  // pre-fill import textarea with the sample so users see the expected shape
  document.getElementById("importTextarea").placeholder = JSON.stringify(
    SAMPLE_CHECKLIST_JSON,
    null,
    2,
  );
}

async function loadChecklists() {
  const res = await fetch("/api/checklists");
  checklistState.list = await res.json();
  renderChecklistGrid();
}

function renderChecklistGrid() {
  const grid = document.getElementById("checklistGrid");
  const empty = document.getElementById("checklistEmpty");
  grid.innerHTML = "";

  if (checklistState.list.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  checklistState.list.forEach((c) => {
    const pct = c.total > 0 ? Math.round((c.done / c.total) * 100) : 0;
    const card = document.createElement("div");
    card.className = "checklist-card";
    card.innerHTML = `
      <div class="checklist-card-name">${escapeHtml(c.name)}</div>
      <div class="checklist-card-meta">${c.done}/${c.total} mục đã xong${c.createdDate ? " · tạo ngày " + fmtDateVN(c.createdDate) : ""}</div>
      <div class="checklist-progress-track"><div class="checklist-progress-fill" style="width:${pct}%"></div></div>
    `;
    card.addEventListener("click", () => openChecklistPanel(c.id));
    grid.appendChild(card);
  });
}

// ---------- New checklist modal ----------

function openNewChecklistModal() {
  document.getElementById("newChecklistName").value = "";
  document.getElementById("checklistOverlay").classList.add("show");
  document.getElementById("checklistModal").classList.add("show");
  document.getElementById("newChecklistName").focus();
}

function closeNewChecklistModal() {
  document.getElementById("checklistOverlay").classList.remove("show");
  document.getElementById("checklistModal").classList.remove("show");
}

async function createChecklist() {
  const name = document.getElementById("newChecklistName").value;
  if (!name.trim()) {
    document.getElementById("newChecklistName").focus();
    return;
  }
  const res = await fetch("/api/checklists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (res.ok) {
    const checklist = await res.json();
    closeNewChecklistModal();
    await loadChecklists();
    openChecklistPanel(checklist.id);
  }
}

// ---------- Import modal ----------

function openImportModal() {
  document.getElementById("importTextarea").value = "";
  document.getElementById("importError").textContent = "";
  document.getElementById("importFileInput").value = "";
  document.getElementById("importOverlay").classList.add("show");
  document.getElementById("importModal").classList.add("show");
}

function closeImportModal() {
  document.getElementById("importOverlay").classList.remove("show");
  document.getElementById("importModal").classList.remove("show");
}

function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById("importTextarea").value = reader.result;
  };
  reader.readAsText(file);
}

function useSampleJson() {
  document.getElementById("importTextarea").value = JSON.stringify(
    SAMPLE_CHECKLIST_JSON,
    null,
    2,
  );
  document.getElementById("importError").textContent = "";
}

async function submitImport() {
  const raw = document.getElementById("importTextarea").value;
  const errEl = document.getElementById("importError");
  errEl.textContent = "";

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    errEl.textContent = "JSON không hợp lệ: " + e.message;
    return;
  }

  const res = await fetch("/api/checklists/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed),
  });
  const data = await res.json();
  if (!res.ok) {
    errEl.textContent = data.error || "Import thất bại";
    return;
  }
  closeImportModal();
  await loadChecklists();
  if (data.checklists && data.checklists.length > 0) {
    openChecklistPanel(data.checklists[0].id);
  }
}

// ---------- Checklist detail panel ----------

async function openChecklistPanel(id) {
  checklistState.activeId = id;
  const res = await fetch(`/api/checklists/${id}`);
  if (!res.ok) return;
  checklistState.active = await res.json();
  renderChecklistPanel();
  document.getElementById("checklistPanelOverlay").classList.add("show");
  document.getElementById("checklistPanel").classList.add("show");
}

function closeChecklistPanel() {
  document.getElementById("checklistPanelOverlay").classList.remove("show");
  document.getElementById("checklistPanel").classList.remove("show");
}

function renderChecklistPanel() {
  const c = checklistState.active;
  if (!c) return;
  const total = c.items.length;
  const done = c.items.filter((i) => i.checked).length;
  document.getElementById("checklistPanelName").textContent = c.name;
  document.getElementById("checklistPanelMeta").textContent =
    `${done}/${total} mục đã xong${c.createdDate ? " · tạo ngày " + fmtDateVN(c.createdDate) : ""}`;

  const list = document.getElementById("checklistItems");
  list.innerHTML = "";

  if (c.items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "checklist-items-empty";
    empty.textContent = "Chưa có mục nào. Thêm mục bên dưới hoặc import JSON.";
    list.appendChild(empty);
    return;
  }

  c.items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "checklist-item-row";
    row.innerHTML = `
      <label class="checklist-check">
        <input type="checkbox" ${item.checked ? "checked" : ""}>
        <span class="checklist-item-text ${item.checked ? "done" : ""}">${escapeHtml(item.text)}</span>
      </label>
      <button type="button" class="checklist-item-remove" title="Xóa mục">✕</button>
    `;
    row
      .querySelector('input[type="checkbox"]')
      .addEventListener("change", (e) => {
        toggleItem(item.id, e.target.checked);
      });
    row
      .querySelector(".checklist-item-remove")
      .addEventListener("click", () => {
        removeItem(item.id);
      });
    list.appendChild(row);
  });
}

async function toggleItem(itemId, checked) {
  const res = await fetch(
    `/api/checklists/${checklistState.activeId}/items/${itemId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checked }),
    },
  );
  if (res.ok) {
    const item = checklistState.active.items.find((i) => i.id === itemId);
    if (item) item.checked = checked;
    renderChecklistPanel();
    loadChecklists();
  }
}

async function addItemToActive() {
  const input = document.getElementById("newItemInput");
  const text = input.value;
  if (!text.trim()) {
    input.focus();
    return;
  }
  const res = await fetch(`/api/checklists/${checklistState.activeId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (res.ok) {
    const item = await res.json();
    checklistState.active.items.push(item);
    input.value = "";
    renderChecklistPanel();
    loadChecklists();
    input.focus();
  }
}

async function removeItem(itemId) {
  const res = await fetch(
    `/api/checklists/${checklistState.activeId}/items/${itemId}`,
    { method: "DELETE" },
  );
  if (res.ok) {
    checklistState.active.items = checklistState.active.items.filter(
      (i) => i.id !== itemId,
    );
    renderChecklistPanel();
    loadChecklists();
  }
}

async function deleteActiveChecklist() {
  if (!checklistState.activeId) return;
  if (!confirm("Xóa toàn bộ checklist này?")) return;
  const res = await fetch(`/api/checklists/${checklistState.activeId}`, {
    method: "DELETE",
  });
  if (res.ok) {
    closeChecklistPanel();
    loadChecklists();
  }
}

// ---------- Bootstrap ----------
// Called last, after every const/function above has been defined, so init()
// (and everything it calls: initTabs, initVocab, initChecklist) can safely
// reference vocab, checklistState, SAMPLE_CHECKLIST_JSON, etc.
init();
