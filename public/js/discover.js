const discoverState = {
  words: [],
  index: 0,
  add: true,
  busy: false,
  added: { unsure: 0, review: 0, known: 0 },
  skipped: 0,
};

function initDiscover() {
  document.getElementById("discoverBtn").addEventListener("click", openDiscover);
  document.getElementById("discoverClose").addEventListener("click", closeDiscover);
  document.getElementById("discoverOverlay").addEventListener("click", closeDiscover);
  document.getElementById("discoverDoneClose").addEventListener("click", closeDiscover);
  document.getElementById("discoverMore").addEventListener("click", openDiscover);
  document.getElementById("discoverCard").addEventListener("click", () => {
    document.getElementById("discoverCardInner").classList.toggle("flipped");
  });
  document.querySelectorAll(".discover-add-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (discoverState.busy) return;
      discoverState.add = btn.dataset.add === "1";
      syncDiscoverAddSeg();
    });
  });
  document.getElementById("discoverUnsure").addEventListener("click", () => answerDiscover("unsure"));
  document.getElementById("discoverReview").addEventListener("click", () => answerDiscover("review"));
  document.getElementById("discoverKnown").addEventListener("click", () => answerDiscover("known"));
}

function discoverSkippedKey() {
  return `discoverSkipped:${(currentUser && currentUser.id) || "anon"}`;
}
function getDiscoverSkipped() {
  try {
    return JSON.parse(localStorage.getItem(discoverSkippedKey()) || "[]");
  } catch (e) {
    return [];
  }
}
function rememberDiscoverSkipped(term) {
  try {
    const list = getDiscoverSkipped().filter((t) => t !== term);
    list.push(term.toLowerCase());
    localStorage.setItem(
      discoverSkippedKey(),
      JSON.stringify(list.slice(-500)),
    );
  } catch (e) {}
}

function syncDiscoverAddSeg() {
  document.querySelectorAll(".discover-add-btn").forEach((b) => {
    b.classList.toggle("active", (b.dataset.add === "1") === discoverState.add);
  });
}

function setDiscoverView(view, message) {
  const msg = document.getElementById("discoverMsg");
  msg.style.display = view === "loading" || view === "error" ? "block" : "none";
  document.getElementById("discoverBody").style.display =
    view === "card" ? "block" : "none";
  document.getElementById("discoverControls").style.display =
    view === "card" ? "block" : "none";
  document.getElementById("discoverDone").style.display =
    view === "done" ? "block" : "none";
  if (view === "loading" || view === "error") {
    msg.textContent = message || "";
    if (view === "error") {
      const retry = document.createElement("button");
      retry.className = "btn btn-primary";
      retry.textContent = "Try Again";
      retry.addEventListener("click", openDiscover);
      msg.appendChild(retry);
    }
  }
}

async function openDiscover() {
  document.getElementById("discoverOverlay").classList.add("show");
  document.getElementById("discoverStage").classList.add("show");
  document.getElementById("discoverProgress").textContent = "Discover Words";
  setDiscoverView("loading", "Finding 10 recommended words...");

  try {
    const res = await api("/api/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: 10, exclude: getDiscoverSkipped() }),
    });
    if (!res.ok) {
      let info = null;
      try {
        info = await res.json();
      } catch (_) {}
      throw new Error(
        (info && info.error ? info.error : "HTTP " + res.status) +
          (info && info.debug ? " | " + JSON.stringify(info.debug) : ""),
      );
    }
    const words = await res.json();
    if (!Array.isArray(words) || words.length === 0)
      throw new Error("Server returned an empty word list");

    discoverState.words = words;
    discoverState.index = 0;
    discoverState.busy = false;
    discoverState.added = { unsure: 0, review: 0, known: 0 };
    discoverState.skipped = 0;
    renderDiscoverCard();
  } catch (e) {
    setDiscoverView(
      "error",
      "Unable to fetch new words right now. Details: " + (e && e.message ? e.message : e),
    );
  }
}

function renderDiscoverCard() {
  const w = discoverState.words[discoverState.index];
  discoverState.add = true;
  syncDiscoverAddSeg();
  setDiscoverView("card");

  document.getElementById("discoverProgress").textContent =
    `${discoverState.index + 1} / ${discoverState.words.length}`;
  document.getElementById("dcTerm").textContent = w.term;
  document.getElementById("dcPron").textContent = w.pronunciation || "";
  document.getElementById("dcTermSmall").textContent =
    w.term + (w.pronunciation ? ` ${w.pronunciation}` : "");
  document.getElementById("dcMeanings").innerHTML = w.meanings
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

  document.getElementById("discoverCardInner").classList.remove("flipped");
  const front = document.querySelector("#discoverCard .flashcard-front");
  front.querySelector(".speak-group")?.remove();
  const sp = buildSpeakButtons(w.term);
  sp.style.marginTop = "12px";
  front.appendChild(sp);
}

async function answerDiscover(status) {
  if (discoverState.busy) return;
  const w = discoverState.words[discoverState.index];
  discoverState.busy = true;
  const controls = document.querySelectorAll(
    "#discoverControls button, .discover-add-btn",
  );
  controls.forEach((b) => (b.disabled = true));

  try {
    if (discoverState.add) {
      const res = await api("/api/words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          term: w.term,
          pronunciation: w.pronunciation,
          groupId: null,
          meanings: w.meanings,
          status,
        }),
      });
      if (!res.ok) throw new Error("http " + res.status);
      discoverState.added[status]++;
    } else {
      discoverState.skipped++;
      rememberDiscoverSkipped(w.term);
    }
  } catch (e) {
    alert("Unable to save this word. Please try again.");
    controls.forEach((b) => (b.disabled = false));
    discoverState.busy = false;
    return;
  }

  controls.forEach((b) => (b.disabled = false));
  discoverState.busy = false;
  discoverState.index++;
  if (discoverState.index >= discoverState.words.length) {
    showDiscoverDone();
  } else {
    renderDiscoverCard();
  }
}

function showDiscoverDone() {
  const a = discoverState.added;
  const total = a.unsure + a.review + a.known;
  setDiscoverView("done");
  document.getElementById("discoverProgress").textContent =
    `${discoverState.words.length} / ${discoverState.words.length}`;
  document.getElementById("discoverDoneSummary").textContent =
    `Saved ${total} words (Learning: ${a.unsure} · Review: ${a.review} · Mastered: ${a.known}) · Skipped: ${discoverState.skipped} words`;
}

function closeDiscover() {
  document.getElementById("discoverOverlay").classList.remove("show");
  document.getElementById("discoverStage").classList.remove("show");
  loadWords();
}
