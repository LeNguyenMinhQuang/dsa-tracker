const testState = { queue: [], index: 0, known: 0, review: 0, stillUnsure: 0 };

function initFlashcards() {
  document.getElementById("testModeBtn").addEventListener("click", openTestSetup);
  document.getElementById("testSetupCancel").addEventListener("click", closeTestSetup);
  document.getElementById("testSetupOverlay").addEventListener("click", closeTestSetup);
  document.getElementById("testSetupStart").addEventListener("click", startTestFromSetup);
  document.getElementById("testClose").addEventListener("click", closeTestMode);
  document.getElementById("testOverlay").addEventListener("click", closeTestMode);
  document.getElementById("flashcard").addEventListener("click", flipCard);
  document.getElementById("testKnown").addEventListener("click", () => answerCard("known"));
  document.getElementById("testReview").addEventListener("click", () => answerCard("review"));
  document.getElementById("testStillUnsure").addEventListener("click", () => answerCard("unsure"));
  document.getElementById("testDoneClose").addEventListener("click", closeTestMode);
}

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
    ? `Filtered by active topic: ${groupLabel(vocab.groupFilter)}`
    : "Includes all vocabulary words (no topic filter active).";

  if (vocab.filter === "known") {
    document.getElementById("testSetupUnsure").checked = false;
    document.getElementById("testSetupReview").checked = false;
    document.getElementById("testSetupKnown").checked = true;
  } else if (vocab.filter === "review") {
    document.getElementById("testSetupUnsure").checked = false;
    document.getElementById("testSetupReview").checked = true;
    document.getElementById("testSetupKnown").checked = false;
  } else if (vocab.filter === "unsure") {
    document.getElementById("testSetupUnsure").checked = true;
    document.getElementById("testSetupReview").checked = false;
    document.getElementById("testSetupKnown").checked = false;
  } else {
    document.getElementById("testSetupUnsure").checked = true;
    document.getElementById("testSetupReview").checked = true;
    document.getElementById("testSetupKnown").checked = false;
  }

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
    alert("Select at least 1 word pool to practice.");
    return;
  }

  closeTestSetup();
  openTestMode(statuses);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function openTestMode(statuses) {
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
      "No words available in the selected pool(s). Try selecting a different status or adding new words!";
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
  const front = document.querySelector(".flashcard-front");
  front.querySelector(".speak-group")?.remove();
  const sp = buildSpeakButtons(w.term);
  sp.style.marginTop = "12px";
  front.appendChild(sp);
}

function flipCard() {
  document.getElementById("flashcardInner").classList.toggle("flipped");
}

async function answerCard(result) {
  const w = testState.queue[testState.index];
  await api(`/api/words/${w.id}/status`, {
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
      `Mastered: ${testState.known} · In Review: ${testState.review} · Still Learning: ${testState.stillUnsure}`;
  } else {
    renderTestCard();
  }
}

function closeTestMode() {
  document.getElementById("testOverlay").classList.remove("show");
  document.getElementById("testStage").classList.remove("show");
  loadWords();
}
