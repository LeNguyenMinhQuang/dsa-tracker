/* Admin-only part of the Settings dialog: user management + image generation.
   The server enforces the role on every /api/admin/* call; hiding the block
   for normal users is only for convenience. */

let adminImagePollTimer = null;

const isAdmin = () => !!(currentUser && currentUser.role === "admin");

async function adminFetch(url, opts = {}) {
  const res = await api(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {}
  if (!res.ok) throw new Error((data && data.error) || "HTTP " + res.status);
  return data;
}

function initAdmin() {
  if (!isAdmin()) return;
  document
    .getElementById("adminAddUser")
    .addEventListener("click", addAdminUser);
  document
    .getElementById("adminGenImages")
    .addEventListener("click", startImageBackfill);
  document
    .getElementById("adminDeleteAllImages")
    .addEventListener("click", deleteAllImages);
  document
    .getElementById("adminStopImages")
    .addEventListener("click", stopImageGeneration);
  document.getElementById("adminNewPass").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addAdminUser();
  });
}

async function loadAdminPanel() {
  const section = document.getElementById("adminSection");
  if (!isAdmin()) {
    section.style.display = "none";
    return;
  }
  section.style.display = "block";
  document.getElementById("adminUserError").textContent = "";
  await Promise.all([refreshAdminUsers(), refreshImageStatus()]);
}

function stopAdminPolling() {
  clearTimeout(adminImagePollTimer);
  adminImagePollTimer = null;
}

/* --------------------------------- Users --------------------------------- */

async function refreshAdminUsers() {
  try {
    renderAdminUsers(await adminFetch("/api/admin/users"));
  } catch (e) {
    document.getElementById("adminUserError").textContent = e.message;
  }
}

function renderAdminUsers(users) {
  const list = document.getElementById("adminUserList");
  list.innerHTML = "";
  users.forEach((u) => {
    const isSelf = u.id === currentUser.id;
    const row = document.createElement("div");
    row.className = "admin-user-row";

    const name = document.createElement("div");
    name.className = "admin-user-name";
    name.textContent =
      u.name +
      (isSelf ? " (you)" : "") +
      (u.hasPassword ? "" : " — no password");

    const badge = document.createElement("span");
    badge.className = "role-badge " + u.role;
    badge.textContent = u.role;

    const pwBtn = document.createElement("button");
    pwBtn.type = "button";
    pwBtn.className = "btn btn-secondary";
    pwBtn.textContent = "Password";
    pwBtn.addEventListener("click", () => changeUserPassword(u));

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn btn-danger";
    delBtn.textContent = "Delete";
    delBtn.disabled = isSelf;
    delBtn.title = isSelf
      ? "You cannot delete your own account"
      : "Delete user";
    delBtn.addEventListener("click", () => deleteAdminUser(u));

    row.append(name, badge, pwBtn, delBtn);
    list.appendChild(row);
  });
}

async function addAdminUser() {
  const nameEl = document.getElementById("adminNewName");
  const passEl = document.getElementById("adminNewPass");
  const roleEl = document.getElementById("adminNewRole");
  const err = document.getElementById("adminUserError");
  err.textContent = "";

  if (!nameEl.value.trim()) {
    nameEl.focus();
    return;
  }
  try {
    await adminFetch("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        name: nameEl.value,
        password: passEl.value,
        role: roleEl.value,
      }),
    });
    nameEl.value = "";
    passEl.value = "";
    roleEl.value = "user";
    await refreshAdminUsers();
  } catch (e) {
    err.textContent = e.message;
  }
}

function changeUserPassword(user) {
  openPasswordModal({
    title: "Change password",
    desc: "New password for " + user.name + " (min 6 characters)",
    confirmLabel: "Save",
    autocomplete: "new-password",
    onSubmit: async (password) => {
      await adminFetch(
        "/api/admin/users/" + encodeURIComponent(user.id) + "/password",
        {
          method: "PUT",
          body: JSON.stringify({ password }),
        },
      );
      closePasswordModal();
      await refreshAdminUsers();
    },
  });
}

async function deleteAdminUser(user) {
  if (
    !confirm(
      'Delete "' +
        user.name +
        '" and ALL of their data (problems, vocabulary, checklists)? This cannot be undone.',
    )
  )
    return;
  try {
    await adminFetch("/api/admin/users/" + encodeURIComponent(user.id), {
      method: "DELETE",
    });
    await refreshAdminUsers();
  } catch (e) {
    document.getElementById("adminUserError").textContent = e.message;
  }
}

/* ---------------------------- Image generation ---------------------------- */

function renderImageStatus(s) {
  const el = document.getElementById("adminImageStatus");
  const genBtn = document.getElementById("adminGenImages");
  const stopBtn = document.getElementById("adminStopImages");
  const total = s.images + s.pending;
  const pct = total > 0 ? Math.round((s.images / total) * 100) : 0;

  el.innerHTML = "";
  const count = document.createElement("div");
  count.className = "q-count";
  const left = document.createElement("span");
  left.textContent = s.images + " ready · " + s.pending + " waiting";
  const right = document.createElement("span");
  right.textContent = pct + "%";
  count.append(left, right);

  const bar = document.createElement("div");
  bar.className = "q-bar" + (s.running ? " running" : "");
  const fill = document.createElement("div");
  fill.className = "q-fill";
  fill.style.width = pct + "%";
  bar.appendChild(fill);

  const state = document.createElement("div");
  state.className = "q-state";
  const run = s.run;
  const last = s.lastRun;
  if (s.running) {
    state.textContent =
      (s.stopping ? "Stopping after the current word..." : "Generating") +
      (s.currentTerm && !s.stopping ? ": " + s.currentTerm : "") +
      (run ? "\n" + run.done + " done · " + run.failed + " failed" : "");
  } else if (s.lastBlocked || (last && last.stopped === "ratelimited")) {
    state.className = "q-state err";
    state.textContent =
      "STOPPED — provider quota used up or credentials invalid." +
      (s.lastBlocked ? "\n" + s.lastBlocked.message : "") +
      "\nWords stay queued. Press Generate again later (free quota resets daily).";
  } else if (last) {
    const why =
      last.stopped === "cancelled" ? "stopped by you" : "queue finished";
    state.textContent =
      "Idle — last run " +
      why +
      ": " +
      last.done +
      " done · " +
      last.failed +
      " failed.";
  } else {
    state.textContent =
      'Idle. Nothing is generated automatically — press "Generate missing images".';
  }
  el.append(count, bar, state);

  Loading.busy(genBtn, !!s.running, "Generating...");
  stopBtn.style.display = s.running ? "block" : "none";
  stopBtn.disabled = !!s.stopping;
}

async function refreshImageStatus(silent = true) {
  try {
    const s = await adminFetch("/api/admin/images/status", { silent });
    renderImageStatus(s);
    schedulePolling(s);
  } catch (e) {
    document.getElementById("adminImageStatus").textContent = e.message;
  }
}

// Keep refreshing while the queue is running and the Settings dialog is open
function schedulePolling(s) {
  stopAdminPolling();
  const open = document
    .getElementById("settingsModal")
    .classList.contains("show");
  if (!open || !s.running) return;
  adminImagePollTimer = setTimeout(() => refreshImageStatus(true), 2500);
}

async function startImageBackfill() {
  const btn = document.getElementById("adminGenImages");
  const msg = document.getElementById("adminImageMsg");
  msg.className = "admin-note";
  msg.textContent = "";
  try {
    const r = await adminFetch("/api/admin/images/backfill", {
      method: "POST",
      body: JSON.stringify({
        retryFailed: document.getElementById("adminRetryFailed").checked,
      }),
    });
    msg.textContent =
      r.total +
      " distinct word(s) · " +
      r.alreadyHave +
      " already have an image · " +
      r.queued +
      " newly queued" +
      (r.failedSkipped
        ? " · " + r.failedSkipped + " skipped (failed before)"
        : "") +
      (r.status.pending === 0 ? "\nNothing to generate." : "");
    renderImageStatus(r.status);
    schedulePolling(r.status);
  } catch (e) {
    msg.className = "admin-note error";
    msg.textContent = e.message;
    Loading.busy(btn, false);
  }
}

async function stopImageGeneration() {
  try {
    const s = await adminFetch("/api/admin/images/stop", { method: "POST" });
    renderImageStatus(s);
    schedulePolling(s);
  } catch (e) {
    const msg = document.getElementById("adminImageMsg");
    msg.className = "admin-note error";
    msg.textContent = e.message;
  }
}

async function deleteAllImages() {
  const btn = document.getElementById("adminDeleteAllImages");
  const msg = document.getElementById("adminImageMsg");
  if (
    !confirm(
      "Delete ALL word illustrations (for every user) and clear the generation queue? " +
        'This cannot be undone. You can regenerate them afterwards with "Generate missing images".',
    )
  )
    return;
  msg.className = "admin-note";
  msg.textContent = "";
  Loading.busy(btn, true, "Deleting...");
  try {
    const r = await adminFetch("/api/admin/images/all", { method: "DELETE" });
    msg.textContent = r.deleted + " image(s) deleted.";
    renderImageStatus(r.status);
    schedulePolling(r.status);
    // Refresh the vocabulary list so the removed images disappear
    if (typeof vocab !== "undefined" && typeof loadWords === "function") {
      vocab.words.forEach((w) => (w.imageUrl = null));
      loadWords().catch(() => {});
    }
  } catch (e) {
    msg.className = "admin-note error";
    msg.textContent = e.message;
  } finally {
    Loading.busy(btn, false);
  }
}
