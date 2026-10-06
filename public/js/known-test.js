// Known-words test: one page with every Mastered word as a 4-option question.
// Progress (questions, options, answers) is saved in localStorage so it
// survives reloads and leaving the page. After grading, wrong words are
// moved to "Review".

const KT_MODES = [
  { value: "en2vi", label: "English Word → Select Definition" },
  { value: "vi2en", label: "Definition → Select English Word" },
  { value: "listen2en", label: "Listen Audio → Select English Word" },
  { value: "listen2vi", label: "Listen Audio → Select Definition" },
];

const ktState = {
  session: null,
  applying: false,
  changed: false,
};

const ktIsTermOptions = (mode) => mode === "vi2en" || mode === "listen2en";
const ktIsListen = (mode) => mode === "listen2en" || mode === "listen2vi";
const ktModeLabel = (mode) =>
  (KT_MODES.find((m) => m.value === mode) || KT_MODES[0]).label;

function initKnownTest() {
  document.getElementById("ktestBtn").addEventListener("click", openKTest);
  document.getElementById("ktestClose").addEventListener("click", closeKTest);
  document.getElementById("ktestOverlay").addEventListener("click", closeKTest);
  document.getElementById("ktestGrade").addEventListener("click", gradeKTest);
  ktState.session = ktLoad();
  ktUpdateBadge();
}

/* ---------- persistence ---------- */

function ktKey() {
  return `knownTest:${(currentUser && currentUser.id) || "anon"}`;
}

function ktLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(ktKey()) || "null");
    return s && s.v === 1 && Array.isArray(s.questions) ? s : null;
  } catch (e) {
    return null;
  }
}

function ktSave() {
  try {
    if (ktState.session) {
      localStorage.setItem(ktKey(), JSON.stringify(ktState.session));
    } else {
      localStorage.removeItem(ktKey());
    }
  } catch (e) {}
  ktUpdateBadge();
}

function ktAnswered(s) {
  return s.questions.filter((q) => q.answer !== null).length;
}

function ktUpdateBadge() {
  const badge = document.getElementById("ktestBadge");
  if (!badge) return;
  const s = ktState.session;
  if (s && !s.graded) {
    badge.textContent = `${ktAnswered(s)}/${s.questions.length}`;
    badge.style.display = "";
  } else {
    badge.style.display = "none";
  }
}

/* ---------- open / close ---------- */

function openKTest() {
  ktState.session = ktLoad();
  document.getElementById("ktestOverlay").classList.add("show");
  document.getElementById("ktestStage").classList.add("show");

  const s = ktState.session;
  if (s && s.graded) {
    ktShowResult();
    ktApplyPending();
  } else if (s) {
    ktShowResume();
  } else {
    ktShowSetup();
  }
}

function closeKTest() {
  document.getElementById("ktestOverlay").classList.remove("show");
  document.getElementById("ktestStage").classList.remove("show");
  if (ktState.changed) {
    ktState.changed = false;
    loadWords();
  }
}

function ktSetView(progressText, showFooter) {
  document.getElementById("ktestProgress").textContent = progressText;
  document.getElementById("ktestFooter").style.display = showFooter
    ? "block"
    : "none";
  const scroll = document.getElementById("ktestScroll");
  scroll.innerHTML = "";
  scroll.scrollTop = 0;
  return scroll;
}

/* ---------- setup / resume ---------- */

function ktKnownWords() {
  return vocab.words.filter((w) => w.status === "known");
}

function ktShowSetup() {
  const known = ktKnownWords();
  const scroll = ktSetView("Test", false);

  scroll.innerHTML = `
    <div class="ktest-panel">
      <h3 class="ktest-title">Mastered Words Test</h3>
      <p class="ktest-note">
        All <strong>${known.length}</strong> Mastered word(s) are tested on one
        page. Press Grade when finished — wrong answers are moved to Review.
        Your progress is saved automatically.
      </p>
      <span class="field-label-inline">Test Mode</span>
      <div class="test-setup-options">
        ${KT_MODES.map(
          (m, i) => `
          <label class="test-setup-option">
            <input type="radio" name="ktestMode" value="${m.value}" ${i === 0 ? "checked" : ""} />
            <span>${escapeHtml(m.label)}</span>
          </label>`,
        ).join("")}
      </div>
      <div class="task-actions">
        <button class="btn btn-secondary" id="ktestSetupCancel">Cancel</button>
        <button class="btn btn-primary" id="ktestSetupStart" ${known.length ? "" : "disabled"}>
          Start Test
        </button>
      </div>
    </div>`;

  document
    .getElementById("ktestSetupCancel")
    .addEventListener("click", closeKTest);
  document
    .getElementById("ktestSetupStart")
    .addEventListener("click", startKTest);
}

function ktShowResume() {
  const s = ktState.session;
  const scroll = ktSetView("Test", false);
  scroll.innerHTML = `
    <div class="ktest-panel">
      <h3 class="ktest-title">Test In Progress</h3>
      <p class="ktest-note">
        Answered <strong>${ktAnswered(s)} / ${s.questions.length}</strong><br />
        Mode: ${escapeHtml(ktModeLabel(s.mode))}
      </p>
      <div class="task-actions">
        <button class="btn btn-secondary" id="ktestRestart">Start New</button>
        <button class="btn btn-primary" id="ktestContinue">Continue</button>
      </div>
    </div>`;

  document
    .getElementById("ktestContinue")
    .addEventListener("click", ktShowQuiz);
  document.getElementById("ktestRestart").addEventListener("click", () => {
    if (!confirm("Discard the current test and start a new one?")) return;
    ktState.session = null;
    ktSave();
    ktShowSetup();
  });
}

/* ---------- building the test ---------- */

function ktDefOf(w) {
  return (w.meanings && w.meanings[0] && w.meanings[0].definition) || "";
}

function ktBuildQuestion(w, mode) {
  const correctDef = ktDefOf(w) || "(no definition)";
  let options;

  if (ktIsTermOptions(mode)) {
    const seen = new Set([w.term.trim().toLowerCase()]);
    const others = shuffle(vocab.words.filter((x) => x.id !== w.id)).filter(
      (x) => {
        const key = x.term.trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      },
    );
    options = [
      { text: w.term, correct: true },
      ...others.slice(0, 3).map((o) => ({ text: o.term, correct: false })),
    ];
  } else {
    const seen = new Set([correctDef.trim().toLowerCase()]);
    const others = shuffle(vocab.words.filter((x) => x.id !== w.id)).filter(
      (x) => {
        const key = ktDefOf(x).trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      },
    );
    options = [
      { text: correctDef, correct: true },
      ...others.slice(0, 3).map((o) => ({ text: ktDefOf(o), correct: false })),
    ];
  }

  return {
    id: w.id,
    term: w.term,
    pron: w.pronunciation || "",
    def: correctDef,
    options: shuffle(options),
    answer: null,
  };
}

function startKTest() {
  const known = ktKnownWords();
  if (known.length === 0) {
    alert("You have no Mastered words to test.");
    return;
  }
  const modeEl = document.querySelector('input[name="ktestMode"]:checked');
  const mode = modeEl ? modeEl.value : "en2vi";

  ktState.session = {
    v: 1,
    mode,
    createdAt: Date.now(),
    graded: false,
    questions: shuffle(known).map((w) => ktBuildQuestion(w, mode)),
    wrongIds: [],
    pendingIds: [],
    score: 0,
  };
  ktSave();
  ktShowQuiz();
}

/* ---------- quiz page ---------- */

function ktUpdateProgress() {
  const s = ktState.session;
  if (!s || s.graded) return;
  const answered = ktAnswered(s);
  document.getElementById("ktestProgress").textContent =
    `Test · ${answered} / ${s.questions.length} answered`;
  document.getElementById("ktestGrade").textContent =
    `Grade (${answered} / ${s.questions.length})`;
}

function ktShowQuiz() {
  const s = ktState.session;
  const scroll = ktSetView("Test", true);

  s.questions.forEach((q, qi) =>
    scroll.appendChild(ktRenderQuestion(q, qi, s.mode)),
  );
  ktUpdateProgress();
}

function ktRenderQuestion(q, qi, mode) {
  const card = document.createElement("div");
  card.className = "ktest-q";

  const num = document.createElement("div");
  num.className = "ktest-q-num";
  num.textContent = `#${qi + 1}`;
  card.appendChild(num);

  const termEl = document.createElement("div");
  termEl.className = "ktest-q-term";
  if (ktIsListen(mode)) {
    termEl.classList.add("ktest-q-vi");
    termEl.textContent = "🔊 Listen and select answer";
    card.appendChild(termEl);
    card.appendChild(buildSpeakButtons(q.term));
  } else if (mode === "vi2en") {
    termEl.classList.add("ktest-q-vi");
    termEl.textContent = q.def;
    card.appendChild(termEl);
  } else {
    termEl.textContent = q.term;
    card.appendChild(termEl);
    if (q.pron) {
      const pron = document.createElement("div");
      pron.className = "ktest-q-pron";
      pron.textContent = q.pron;
      card.appendChild(pron);
    }
    card.appendChild(buildSpeakButtons(q.term));
  }

  const optWrap = document.createElement("div");
  optWrap.className = "quiz-options ktest-options";
  q.options.forEach((opt, oi) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quiz-option-btn";
    if (q.answer === oi) btn.classList.add("selected");
    btn.textContent = opt.text;
    btn.addEventListener("click", () => {
      q.answer = oi;
      ktSave();
      optWrap
        .querySelectorAll(".quiz-option-btn")
        .forEach((b, i) => b.classList.toggle("selected", i === oi));
      ktUpdateProgress();
    });
    optWrap.appendChild(btn);
  });
  card.appendChild(optWrap);
  return card;
}

/* ---------- grading ---------- */

async function gradeKTest() {
  const s = ktState.session;
  if (!s || s.graded) return;

  const unanswered = s.questions.length - ktAnswered(s);
  if (unanswered > 0) {
    const ok = confirm(
      `${unanswered} question(s) are unanswered. They will count as wrong and be moved to Review. Grade anyway?`,
    );
    if (!ok) return;
  }

  const wrong = s.questions.filter(
    (q) => q.answer === null || !q.options[q.answer].correct,
  );
  s.graded = true;
  s.wrongIds = wrong.map((q) => q.id);
  s.pendingIds = [...s.wrongIds];
  s.score = s.questions.length - wrong.length;
  ktSave();

  ktShowResult();
  await ktApplyPending();
}

async function ktApplyPending() {
  const s = ktState.session;
  if (!s || !s.graded || s.pendingIds.length === 0 || ktState.applying) return;

  ktState.applying = true;
  ktShowResult();

  const results = await Promise.all(
    s.pendingIds.map(async (id) => {
      try {
        const res = await api(`/api/words/${id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "review" }),
          silent: true,
        });
        // 404 = word was deleted in the meantime, nothing left to update
        return { id, ok: res.ok || res.status === 404 };
      } catch (e) {
        return { id, ok: false };
      }
    }),
  );

  const done = new Set(results.filter((r) => r.ok).map((r) => r.id));
  done.forEach((id) => {
    const w = vocab.words.find((x) => x.id === id);
    if (w) w.status = "review";
  });
  if (done.size > 0) ktState.changed = true;
  s.pendingIds = s.pendingIds.filter((id) => !done.has(id));

  ktState.applying = false;
  ktSave();
  ktShowResult();
}

function ktShowResult() {
  const s = ktState.session;
  const scroll = ktSetView("Test Result", false);
  const total = s.questions.length;
  const pct = total ? Math.round((s.score / total) * 100) : 0;
  const wrongSet = new Set(s.wrongIds);
  const wrongQs = s.questions.filter((q) => wrongSet.has(q.id));

  let status = "";
  if (ktState.applying) {
    status = `<p class="ktest-note">Moving ${s.pendingIds.length} word(s) to Review…</p>`;
  } else if (s.pendingIds.length > 0) {
    status = `<p class="ktest-note ktest-warn">Could not update ${s.pendingIds.length} word(s).
      <button class="btn btn-secondary" id="ktestRetry">Retry</button></p>`;
  } else if (wrongQs.length > 0) {
    status = `<p class="ktest-note">${wrongQs.length} word(s) moved to Review.</p>`;
  } else {
    status = `<p class="ktest-note">Perfect score! No words moved.</p>`;
  }

  const wrongHtml = wrongQs
    .map((q) => {
      const chosen = q.answer === null ? null : q.options[q.answer].text;
      return `
      <div class="ktest-wrong-item">
        <div class="ktest-wrong-term">${escapeHtml(q.term)}
          <span class="ktest-wrong-pron">${escapeHtml(q.pron)}</span></div>
        <div class="ktest-wrong-def">${escapeHtml(q.def)}</div>
        <div class="ktest-wrong-yours">Your answer: ${
          chosen === null ? "(none)" : escapeHtml(chosen)
        }</div>
      </div>`;
    })
    .join("");

  scroll.innerHTML = `
    <div class="ktest-panel">
      <div class="test-done-title">${s.score} / ${total}</div>
      <div class="ktest-pct">${pct}% · ${escapeHtml(ktModeLabel(s.mode))}</div>
      ${status}
      ${
        wrongQs.length
          ? `<div class="ktest-wrong-head">Incorrect (${wrongQs.length})</div>
             <div class="ktest-wrong-list">${wrongHtml}</div>`
          : ""
      }
      <div class="task-actions">
        <button class="btn btn-secondary" id="ktestResultClose">Close</button>
        <button class="btn btn-primary" id="ktestNew" ${ktState.applying ? "disabled" : ""}>New Test</button>
      </div>
    </div>`;

  document
    .getElementById("ktestResultClose")
    .addEventListener("click", closeKTest);
  document.getElementById("ktestNew").addEventListener("click", () => {
    if (ktState.applying) return;
    ktState.session = null;
    ktSave();
    ktShowSetup();
  });
  const retry = document.getElementById("ktestRetry");
  if (retry) retry.addEventListener("click", ktApplyPending);
}
