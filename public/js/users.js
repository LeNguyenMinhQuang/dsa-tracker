/* ---------- Password modal (shared: sign in / admin changes a password) ---------- */

let pwHandler = null;

function openPasswordModal({ title, desc, confirmLabel, autocomplete, onSubmit }) {
  pwHandler = onSubmit;
  document.getElementById("pwTitle").textContent = title;
  document.getElementById("pwDesc").textContent = desc || "";
  document.getElementById("pwConfirm").textContent = confirmLabel || "OK";
  document.getElementById("pwError").textContent = "";
  const input = document.getElementById("pwInput");
  input.value = "";
  input.setAttribute("autocomplete", autocomplete || "current-password");
  document.getElementById("pwOverlay").classList.add("show");
  document.getElementById("pwModal").classList.add("show");
  input.focus();
}

function closePasswordModal() {
  pwHandler = null;
  document.getElementById("pwOverlay").classList.remove("show");
  document.getElementById("pwModal").classList.remove("show");
}

async function submitPasswordModal() {
  if (!pwHandler) return;
  const input = document.getElementById("pwInput");
  const err = document.getElementById("pwError");
  const btn = document.getElementById("pwConfirm");
  if (!input.value) {
    input.focus();
    return;
  }
  err.textContent = "";
  btn.disabled = true;
  try {
    await pwHandler(input.value);
  } catch (e) {
    err.textContent = e && e.message ? e.message : "Something went wrong";
  } finally {
    btn.disabled = false;
  }
}

/* ---------------------------------- Sign in --------------------------------- */

function selectUser(user) {
  openPasswordModal({
    title: "Sign in",
    desc: "Enter the password for " + user.name,
    confirmLabel: "Sign in",
    autocomplete: "current-password",
    onSubmit: async (password) => {
      let res;
      try {
        res = await api("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, password }),
        });
      } catch (e) {
        throw new Error("Network error. Please try again.");
      }
      let data = null;
      try {
        data = await res.json();
      } catch (e) {}
      if (!res.ok) throw new Error((data && data.error) || "Sign in failed");

      try {
        localStorage.setItem(
          USER_KEY,
          JSON.stringify({
            id: data.user.id,
            name: data.user.name,
            role: data.user.role,
            token: data.token,
          }),
        );
      } catch (e) {}
      location.reload();
    },
  });
}

async function switchUser() {
  // Best effort: invalidate the session on the server (plain fetch, so an
  // expired session cannot trap us in api()'s 401 handling)
  try {
    if (currentUser && currentUser.token) {
      await window.fetch("/api/logout", {
        method: "POST",
        headers: { Authorization: "Bearer " + currentUser.token },
      });
    }
  } catch (e) {}
  try {
    localStorage.removeItem(USER_KEY);
  } catch (e) {}
  location.reload();
}

async function showUserPicker() {
  document.body.classList.add("picking");
  const list = document.getElementById("userList");
  const err = document.getElementById("userError");
  err.textContent = "";
  try {
    const res = await api("/api/users");
    if (!res.ok) throw new Error("bad status");
    renderUserList(await res.json());
  } catch (e) {
    list.innerHTML = "";
    err.textContent =
      "Unable to load user list. Please check your network connection and reload the page.";
  }
}

function renderUserList(users) {
  const list = document.getElementById("userList");
  list.innerHTML = "";

  if (users.length === 0) {
    const err = document.getElementById("userError");
    err.textContent =
      "No profiles yet. Create the first admin from the server: node scripts/setPassword.js <name> <password> --admin";
    return;
  }

  users.forEach((u) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "user-card";
    const name = document.createElement("span");
    name.className = "user-card-name";
    name.textContent = u.name;
    const meta = document.createElement("span");
    meta.className = "user-card-meta";
    meta.textContent = u.createdDate ? "Created " + fmtDate(u.createdDate) : "";
    card.append(name, meta);
    card.addEventListener("click", () => selectUser(u));
    list.appendChild(card);
  });
}

function initUserPicker() {
  document.getElementById("pwCancel").addEventListener("click", closePasswordModal);
  document.getElementById("pwOverlay").addEventListener("click", closePasswordModal);
  document.getElementById("pwConfirm").addEventListener("click", submitPasswordModal);
  document.getElementById("pwInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitPasswordModal();
  });
}
