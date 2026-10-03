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
  document.getElementById("adminAddUser").addEventListener("click", addAdminUser);
  document.getElementById("adminGenImages").addEventListener("click", startImageBackfill);
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
      u.name + (isSelf ? " (you)" : "") + (u.hasPassword ? "" : " — no password");

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
    delBtn.title = isSelf ? "You cannot delete your own account" : "Delete user";
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
      await adminFetch("/api/admin/users/" + encodeURIComponent(user.id) + "/password", {
        method: "PUT",
        body: JSON.stringify({ password }),
      });
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
  let text = s.images + " image(s) ready · " + s.pending + " waiting";
  if (!s.workerRunning) {
    text +=
      "\nBackground worker is OFF on this server (IMAGE_WORKER=off). " +
      "Run: node scripts/backfillImages.js --process";
  } else if (s.paused) {
    const until = s.pausedUntil ? new Date(s.pausedUntil).toLocaleTimeString() : "";
    text +=
      "\nPaused until " + until + " (quota used up or invalid credentials)" +
      (s.lastBlocked ? ": " + s.lastBlocked.message : "");
  } else if (s.pending > 0) {
    text += "\nGenerating in the background...";
  } else {
    text += "\nIdle";
  }
  el.textContent = text;
}

async function refreshImageStatus() {
  try {
    const s = await adminFetch("/api/admin/images/status");
    renderImageStatus(s);
    schedulePolling(s);
  } catch (e) {
    document.getElementById("adminImageStatus").textContent = e.message;
  }
}

// Keep refreshing while words are waiting and the Settings dialog is open
function schedulePolling(s) {
  stopAdminPolling();
  const open = document.getElementById("settingsModal").classList.contains("show");
  if (!open || !s.workerRunning || s.paused || s.pending === 0) return;
  adminImagePollTimer = setTimeout(refreshImageStatus, 4000);
}

async function startImageBackfill() {
  const btn = document.getElementById("adminGenImages");
  const msg = document.getElementById("adminImageMsg");
  msg.className = "admin-note";
  msg.textContent = "Scanning all users' words...";
  btn.disabled = true;
  try {
    const r = await adminFetch("/api/admin/images/backfill", {
      method: "POST",
      body: JSON.stringify({
        retryFailed: document.getElementById("adminRetryFailed").checked,
      }),
    });
    msg.textContent =
      r.total + " distinct word(s) · " + r.alreadyHave + " already have an image · " +
      r.queued + " queued" +
      (r.failedSkipped ? " · " + r.failedSkipped + " skipped (failed before)" : "");
    renderImageStatus(r.status);
    schedulePolling(r.status);
  } catch (e) {
    msg.className = "admin-note error";
    msg.textContent = e.message;
  } finally {
    btn.disabled = false;
  }
}
