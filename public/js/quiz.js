const quizState = {
  queue: [],
  total: 0,
  mistakes: 0,
  selectedStatusChange: "",
  mode: "en2vi",
};

const quizOptionsAreTerms = (mode) => mode === "vi2en" || mode === "listen2en";
const quizIsListening = (mode) => mode === "listen2en" || mode === "listen2vi";

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

  const defaultQuizStatus = ["unsure", "review", "known"].includes(vocab.filter)
    ? vocab.filter
    : "unsure";
  document.querySelector(
    `input[name="quizSetupStatus"][value="${defaultQuizStatus}"]`,
  ).checked = true;
  updateQuizSetupHint();
  document.querySelector('input[name="quizSetupMode"][value="en2vi"]').checked =
    true;

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
      ? `Pool "${statusLabel[status]}" currently has ${available} word(s).`
      : `Pool "${statusLabel[status]}" has no words available.`;
  if (vocab.groupFilter) {
    hint += ` (filtered by active topic: ${groupLabel(vocab.groupFilter)})`;
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
    alert(`Pool "${statusLabel[status]}" has no words to test.`);
    return;
  }

  let count = parseInt(document.getElementById("quizSetupCount").value, 10);
  if (isNaN(count) || count < 1) count = 1;
  if (count > pool.length) count = pool.length;

  const modeEl = document.querySelector('input[name="quizSetupMode"]:checked');
  const mode = modeEl ? modeEl.value : "en2vi";

  closeQuizSetup();
  openQuizMode(shuffle(pool).slice(0, count), mode);
}

function openQuizMode(words, mode = "en2vi") {
  quizState.mode = mode;
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

function resetQuizStatusSeg() {
  quizState.selectedStatusChange = "";
  document.querySelectorAll(".quiz-status-btn").forEach((b) => {
    b.disabled = false;
    b.classList.toggle("active", b.dataset.status === "");
  });
}

function buildQuizQuestion() {
  resetQuizStatusSeg();
  const w = quizState.queue[0];
  const defOf = (x) => (x.meanings[0] && x.meanings[0].definition) || "";
  const correctDef = defOf(w) || "(no definition)";

  let options;
  if (quizOptionsAreTerms(quizState.mode)) {
    const seen = new Set([w.term.trim().toLowerCase()]);
    const others = shuffle(vocab.words.filter((x) => x.id !== w.id)).filter(
      (x) => {
        const key = x.term.trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      },
    );
    options = shuffle([
      { text: w.term, correct: true },
      ...others.slice(0, 3).map((o) => ({ text: o.term, correct: false })),
    ]);
  } else {
    const otherWords = vocab.words.filter((x) => x.id !== w.id && defOf(x));
    const distractors = shuffle(otherWords).slice(0, 3);
    options = shuffle([
      { text: correctDef, correct: true },
      ...distractors.map((o) => ({ text: defOf(o), correct: false })),
    ]);
  }

  renderQuizQuestion(w, options, correctDef);
}

function renderQuizQuestion(w, options, correctDef) {
  const mode = quizState.mode;
  const isViToEn = mode === "vi2en";
  const isListen = quizIsListening(mode);
  document.getElementById("quizProgress").textContent =
    `${quizState.total - quizState.queue.length + 1} / ${quizState.total}`;

  const termEl = document.getElementById("quizTerm");
  const pronEl = document.getElementById("quizTermPron");
  termEl.classList.toggle("quiz-term-vi", isViToEn || isListen);

  if (isListen) {
    termEl.textContent = "🔊 Listen and select answer";
    pronEl.textContent = "";
  } else if (isViToEn) {
    termEl.textContent = correctDef;
    pronEl.textContent = "";
  } else {
    termEl.textContent = w.term;
    pronEl.textContent = w.pronunciation || "";
  }

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

  termEl.parentNode.querySelector(".quiz-speak")?.remove();
  if (!isViToEn) addQuizSpeak(w);
  if (isListen) speak(w.term, "en-US");
}

function addQuizSpeak(w) {
  const termEl = document.getElementById("quizTerm");
  termEl.parentNode.querySelector(".quiz-speak")?.remove();
  const sp = buildSpeakButtons(w.term);
  sp.classList.add("quiz-speak");
  termEl.parentNode.insertBefore(
    sp,
    document.getElementById("quizTermPron").nextSibling,
  );
}

async function applyQuizStatusChange(word, status) {
  try {
    const res = await api(`/api/words/${word.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) word.status = status;
  } catch (e) {
  }
}

function handleQuizAnswer(isCorrect, clickedBtn, optWrap) {
  const buttons = [...optWrap.querySelectorAll(".quiz-option-btn")];
  buttons.forEach((b) => {
    b.disabled = true;
    if (b.dataset.correct === "1") b.classList.add("correct");
  });
  if (!isCorrect) clickedBtn.classList.add("wrong");

  if (quizState.mode === "vi2en" || quizIsListening(quizState.mode)) {
    const cur = quizState.queue[0];
    if (quizIsListening(quizState.mode)) {
      document.getElementById("quizTerm").textContent = cur.term;
    }
    document.getElementById("quizTermPron").textContent =
      cur.pronunciation || "";
    if (quizState.mode === "vi2en") addQuizSpeak(cur);
  }

  document
    .querySelectorAll(".quiz-status-btn")
    .forEach((b) => (b.disabled = true));
  const chosenStatus = quizState.selectedStatusChange;

  setTimeout(() => {
    const current = quizState.queue.shift();

    if (isCorrect) {
      if (chosenStatus) applyQuizStatusChange(current, chosenStatus);
    } else {
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
      ? `Great job! You answered all ${quizState.total} word(s) correctly on your first attempt.`
      : `Completed practice on ${quizState.total} word(s) with ${quizState.mistakes} retry turn(s) on incorrect items.`;
}
