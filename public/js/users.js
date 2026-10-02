function selectUser(user) {
  try {
    localStorage.setItem(
      USER_KEY,
      JSON.stringify({ id: user.id, name: user.name }),
    );
  } catch (e) {}
  location.reload();
}

function switchUser() {
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

  users.forEach((u) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "user-card";
    const name = document.createElement("span");
    name.className = "user-card-name";
    name.textContent = u.name;
    const meta = document.createElement("span");
    meta.className = "user-card-meta";
    meta.textContent = u.createdDate
      ? "Created " + fmtDate(u.createdDate)
      : "";
    card.append(name, meta);
    card.addEventListener("click", () => selectUser(u));
    list.appendChild(card);
  });

  const add = document.createElement("button");
  add.type = "button";
  add.className = "user-card user-add";
  add.title = "Add User Profile";
  add.innerHTML =
    '<span class="user-add-plus">+</span><span class="user-card-meta">Add Profile</span>';
  add.addEventListener("click", openUserModal);
  list.appendChild(add);
}

function openUserModal() {
  document.getElementById("newUserName").value = "";
  document.getElementById("newUserError").textContent = "";
  document.getElementById("userOverlay").classList.add("show");
  document.getElementById("userModal").classList.add("show");
  document.getElementById("newUserName").focus();
}

function closeUserModal() {
  document.getElementById("userOverlay").classList.remove("show");
  document.getElementById("userModal").classList.remove("show");
}

async function createUser() {
  const input = document.getElementById("newUserName");
  const err = document.getElementById("newUserError");
  err.textContent = "";
  const name = input.value.trim();
  if (!name) {
    input.focus();
    return;
  }
  try {
    const res = await api("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) {
      err.textContent = data.error || "Failed to create user profile";
      return;
    }
    selectUser(data);
  } catch (e) {
    err.textContent = "Network error. Please try again.";
  }
}

function initUserPicker() {
  document
    .getElementById("userCancel")
    .addEventListener("click", closeUserModal);
  document
    .getElementById("userOverlay")
    .addEventListener("click", closeUserModal);
  document.getElementById("userCreate").addEventListener("click", createUser);
  document.getElementById("newUserName").addEventListener("keydown", (e) => {
    if (e.key === "Enter") createUser();
  });
}
