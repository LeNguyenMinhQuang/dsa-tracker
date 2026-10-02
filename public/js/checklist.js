const SAMPLE_CHECKLIST_JSON = {
  name: "DSA Interview Prep",
  items: [
    { text: "Review Big O notation & space complexity", checked: false },
    { text: "Solve 5 Array & String problems", checked: true },
    { text: "Solve 5 Linked List problems", checked: false },
    { text: "Review Two Pointers & Sliding Window techniques", checked: false },
    { text: "Update resume & prepare interviewer questions", checked: false },
  ],
};

const checklistState = {
  list: [],
  activeId: null,
  active: null,
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

  document.getElementById("importTextarea").placeholder = JSON.stringify(
    SAMPLE_CHECKLIST_JSON,
    null,
    2,
  );
}

async function loadChecklists() {
  const res = await api("/api/checklists");
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
      <div class="checklist-card-meta">${c.done}/${c.total} completed${c.createdDate ? " · created " + fmtDate(c.createdDate) : ""}</div>
      <div class="checklist-progress-track"><div class="checklist-progress-fill" style="width:${pct}%"></div></div>
    `;
    card.addEventListener("click", () => openChecklistPanel(c.id));
    grid.appendChild(card);
  });
}

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
  const res = await api("/api/checklists", {
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
    errEl.textContent = "Invalid JSON syntax: " + e.message;
    return;
  }

  const res = await api("/api/checklists/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed),
  });
  const data = await res.json();
  if (!res.ok) {
    errEl.textContent = data.error || "Import failed";
    return;
  }
  closeImportModal();
  await loadChecklists();
  if (data.checklists && data.checklists.length > 0) {
    openChecklistPanel(data.checklists[0].id);
  }
}

async function openChecklistPanel(id) {
  checklistState.activeId = id;
  const res = await api(`/api/checklists/${id}`);
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
    `${done}/${total} completed${c.createdDate ? " · created " + fmtDate(c.createdDate) : ""}`;

  const list = document.getElementById("checklistItems");
  list.innerHTML = "";

  if (c.items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "checklist-items-empty";
    empty.textContent = "No items added yet. Add items below or import JSON.";
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
      <button type="button" class="checklist-item-remove" title="Remove item">✕</button>
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
  const res = await api(
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
  const res = await api(`/api/checklists/${checklistState.activeId}/items`, {
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
  const res = await api(
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
  if (!confirm("Delete this checklist permanently?")) return;
  const res = await api(`/api/checklists/${checklistState.activeId}`, {
    method: "DELETE",
  });
  if (res.ok) {
    closeChecklistPanel();
    loadChecklists();
  }
}
