const monthLabel = document.getElementById("monthLabel");
const calendarGrid = document.getElementById("calendarGrid");
const overlay = document.getElementById("overlay");
const dayPanel = document.getElementById("dayPanel");
const panelBody = document.getElementById("panelBody");

const diffLabel = { easy: "Easy", medium: "Medium", hard: "Hard" };

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
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  monthLabel.textContent = `${monthNames[state.month - 1]}, ${state.year}`;

  const res = await api(`/api/month/${state.year}/${state.month}`);
  const data = await res.json();
  state.today = data.today;
  renderCalendar(data.days);
}

function renderCalendar(days) {
  calendarGrid.innerHTML = "";
  if (days.length === 0) return;

  const firstDate = new Date(state.year, state.month - 1, 1);
  let offset = firstDate.getDay() - 1;
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

  const pad = (7 - ((offset + days.length) % 7)) % 7;
  for (let i = 0; i < pad; i++) {
    const empty = document.createElement("div");
    empty.className = "day-cell empty";
    calendarGrid.appendChild(empty);
  }
}

async function openPanel(date) {
  state.activeDate = date;
  const res = await api(`/api/day/${date}`);
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

function renderPanel(data) {
  document.getElementById("panelDate").textContent = fmtDate(data.date);
  document.getElementById("panelSub").textContent = data.isToday
    ? "Today"
    : "Past day — editable";

  panelBody.innerHTML = "";

  if (data.newProblems.length > 0) {
    panelBody.appendChild(sectionTitle("New Problems"));
    data.newProblems.forEach((problem, i) => {
      panelBody.appendChild(buildNewCard(i, problem));
    });
  }

  panelBody.appendChild(sectionTitle("Scheduled Reviews"));
  panelBody.appendChild(buildReviewCard(data.reviews));

  panelBody.appendChild(sectionTitle("Random Practice"));
  panelBody.appendChild(buildRandomCard(data.randoms));
}

function sectionTitle(text) {
  const el = document.createElement("div");
  el.className = "panel-section-title";
  el.textContent = text;
  return el;
}

function buildNewCard(index, problem) {
  const card = document.createElement("div");
  card.className = "task-card";

  const bar = document.createElement("div");
  bar.className = "task-bar";
  const preview = problem
    ? `${problem.name} · ${diffLabel[problem.difficulty]}`
    : "No problem set — click to edit";
  bar.innerHTML = `
    <span class="task-icon">[N]</span>
    <div class="task-bar-text">
      <div class="task-title">New Problem #${index + 1}</div>
      <div class="task-preview">${escapeHtml(preview)}</div>
    </div>
    <span class="task-status">${problem && problem.completed ? "[OK]" : ""}</span>
  `;

  const expand = document.createElement("div");
  expand.className = "task-expand";
  expand.innerHTML = `
    <label>Problem Title</label>
    <input type="text" class="new-name" placeholder="e.g. Two Sum" value="${problem ? escapeAttr(problem.name) : ""}">
    <label>Difficulty</label>
    <div class="seg new-difficulty">
      <button type="button" data-val="easy" class="seg-btn diff-easy-btn">Easy</button>
      <button type="button" data-val="medium" class="seg-btn diff-medium-btn">Medium</button>
      <button type="button" data-val="hard" class="seg-btn diff-hard-btn">Hard</button>
    </div>
    <button type="button" class="star-toggle new-star">☆ Star</button>
    <label>Notes</label>
    <textarea class="new-note" rows="3" placeholder="Approach, complexity, key takeaways...">${problem ? escapeHtml(problem.note || "") : ""}</textarea>
    <div class="task-actions">
      <button class="btn btn-secondary new-save">Save</button>
      <button class="btn btn-primary new-complete">${problem && problem.completed ? "Mark Incomplete" : "Mark Completed"}</button>
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
    starBtn.textContent = "★ Starred";
  }
  starBtn.addEventListener("click", () => {
    starBtn.classList.toggle("active");
    starBtn.textContent = starBtn.classList.contains("active")
      ? "★ Starred"
      : "☆ Star";
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

  const res = await api(`/api/day/${state.activeDate}/new/${index}`, {
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
  const res = await api(`/api/day/${state.activeDate}/new/${index}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (res.ok) {
    await refreshPanel();
    await loadMonth();
  }
}

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
      ? `${doneCount}/${withProblem.length} completed`
      : "No review tasks available";
  bar.innerHTML = `
    <span class="task-icon">[R]</span>
    <div class="task-bar-text">
      <div class="task-title">Scheduled Reviews</div>
      <div class="task-preview">${escapeHtml(preview)}</div>
    </div>
    <span class="task-status">${withProblem.length > 0 && doneCount === withProblem.length ? "[OK]" : ""}</span>
  `;

  const expand = document.createElement("div");
  expand.className = "task-expand";
  const list = document.createElement("div");
  list.className = "review-items";

  if (reviews.length === 0) {
    list.innerHTML = `<div class="review-item-empty">No review intervals configured.</div>`;
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
        <div class="review-item-empty">No problem was logged ${review.intervalDays} days ago to review.</div>
      </div>
    `;
    return row;
  }

  const p = review.problem;
  row.innerHTML = `
    <div class="review-item-info">
      <div class="r-name">${escapeHtml(p.name)} ${p.starred ? "★" : ""}</div>
      <div class="r-meta">${diffLabel[p.difficulty]} · solved on ${fmtDate(p.date)} · ${review.intervalDays}-day review interval</div>
      ${p.note ? `<div class="r-note">${escapeHtml(p.note)}</div>` : ""}
    </div>
    <div class="review-item-actions">
      <button class="btn btn-primary review-item-complete">${review.completed ? "Mark Incomplete" : "Mark Completed"}</button>
    </div>
  `;
  row
    .querySelector(".review-item-complete")
    .addEventListener("click", () => toggleReviewComplete(index));
  return row;
}

async function toggleReviewComplete(index) {
  const res = await api(
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
      ? `${doneCount}/${withProblem.length} completed`
      : "No past problems available";
  bar.innerHTML = `
    <span class="task-icon">[?]</span>
    <div class="task-bar-text">
      <div class="task-title">Random Practice</div>
      <div class="task-preview">${escapeHtml(preview)}</div>
    </div>
    <span class="task-status">${withProblem.length > 0 && doneCount === withProblem.length ? "[OK]" : ""}</span>
  `;

  const expand = document.createElement("div");
  expand.className = "task-expand";
  const list = document.createElement("div");
  list.className = "review-items";

  if (randoms.length === 0) {
    list.innerHTML = `<div class="review-item-empty">No random practice problems configured.</div>`;
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
        <div class="review-item-empty">No past problems available for random selection.</div>
      </div>
    `;
    return row;
  }

  const p = random.problem;
  row.innerHTML = `
    <div class="review-item-info">
      <div class="r-name">${escapeHtml(p.name)} ${p.starred ? "★" : ""}</div>
      <div class="r-meta">${diffLabel[p.difficulty]} · first solved on ${fmtDate(p.date)}</div>
      ${p.note ? `<div class="r-note">${escapeHtml(p.note)}</div>` : ""}
    </div>
    <div class="review-item-actions">
      <button class="btn btn-ghost random-item-reroll" title="Reroll another problem">Reroll</button>
      <button class="btn btn-primary random-item-complete">${random.completed ? "Mark Incomplete" : "Mark Completed"}</button>
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
  const res = await api(
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
  const res = await api(`/api/day/${state.activeDate}/random/${index}/reroll`, {
    method: "POST",
  });
  if (res.ok) {
    await refreshPanel();
    await loadMonth();
  }
}

async function refreshPanel() {
  const res = await api(`/api/day/${state.activeDate}`);
  const data = await res.json();
  state.currentDay = data;
  renderPanel(data);
}
