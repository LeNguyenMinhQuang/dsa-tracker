const crypto = require("crypto");
const { loadData, saveData } = require("./dsaService");
const { todayStr } = require("../utils/dateUtils");

function checklistSummary(c) {
  const total = c.items.length;
  const done = c.items.filter((i) => i.checked).length;
  return {
    id: c.id,
    name: c.name,
    createdDate: c.createdDate,
    total,
    done,
  };
}

function normalizeImportedItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems
    .map((it) => {
      if (typeof it === "string") {
        return { id: crypto.randomUUID(), text: it.trim(), checked: false };
      }
      return {
        id: crypto.randomUUID(),
        text: ((it && it.text) || "").trim(),
        checked: !!(it && it.checked),
      };
    })
    .filter((it) => it.text);
}

async function getChecklists(req) {
  const data = await loadData(req);
  const list = Object.values(data.checklists).sort((a, b) =>
    (b.createdDate || "").localeCompare(a.createdDate || ""),
  );
  return list.map(checklistSummary);
}

async function getChecklistById(req, id) {
  const data = await loadData(req);
  const c = data.checklists[id];
  if (!c) {
    const err = new Error("Checklist not found");
    err.status = 404;
    throw err;
  }
  return c;
}

async function createChecklist(req, name) {
  const data = await loadData(req);
  if (!name || !name.trim()) {
    const err = new Error("Checklist name cannot be empty");
    err.status = 400;
    throw err;
  }
  const id = crypto.randomUUID();
  const checklist = {
    id,
    name: name.trim(),
    createdDate: todayStr(),
    items: [],
  };
  data.checklists[id] = checklist;
  await saveData(req, data);
  return checklist;
}

async function importChecklists(req, body) {
  const data = await loadData(req);
  const rawList = Array.isArray(body.checklists) ? body.checklists : [body];

  const created = [];
  for (const raw of rawList) {
    if (!raw || !raw.name || !raw.name.trim()) continue;
    const id = crypto.randomUUID();
    const checklist = {
      id,
      name: raw.name.trim(),
      createdDate: todayStr(),
      items: normalizeImportedItems(raw.items),
    };
    data.checklists[id] = checklist;
    created.push(checklist);
  }

  if (created.length === 0) {
    const err = new Error(
      'Invalid JSON format. Expected object format { "name": "...", "items": [...] } with a non-empty name.'
    );
    err.status = 400;
    throw err;
  }
  await saveData(req, data);
  return { imported: created.length, checklists: created };
}

async function updateChecklist(req, id, name) {
  const data = await loadData(req);
  const c = data.checklists[id];
  if (!c) {
    const err = new Error("Checklist not found");
    err.status = 404;
    throw err;
  }
  if (name && name.trim()) c.name = name.trim();
  await saveData(req, data);
  return c;
}

async function deleteChecklist(req, id) {
  const data = await loadData(req);
  if (!data.checklists[id]) {
    const err = new Error("Checklist not found");
    err.status = 404;
    throw err;
  }
  delete data.checklists[id];
  await saveData(req, data);
  return { ok: true };
}

async function addItem(req, id, text) {
  const data = await loadData(req);
  const c = data.checklists[id];
  if (!c) {
    const err = new Error("Checklist not found");
    err.status = 404;
    throw err;
  }
  if (!text || !text.trim()) {
    const err = new Error("Item content cannot be empty");
    err.status = 400;
    throw err;
  }
  const item = { id: crypto.randomUUID(), text: text.trim(), checked: false };
  c.items.push(item);
  await saveData(req, data);
  return item;
}

async function updateItem(req, id, itemId, body) {
  const data = await loadData(req);
  const c = data.checklists[id];
  if (!c) {
    const err = new Error("Checklist not found");
    err.status = 404;
    throw err;
  }
  const item = c.items.find((i) => i.id === itemId);
  if (!item) {
    const err = new Error("Checklist item not found");
    err.status = 404;
    throw err;
  }
  if (body.text !== undefined && body.text.trim())
    item.text = body.text.trim();
  if (body.checked !== undefined) item.checked = !!body.checked;
  else if (body.toggle) item.checked = !item.checked;
  await saveData(req, data);
  return item;
}

async function deleteItem(req, id, itemId) {
  const data = await loadData(req);
  const c = data.checklists[id];
  if (!c) {
    const err = new Error("Checklist not found");
    err.status = 404;
    throw err;
  }
  const idx = c.items.findIndex((i) => i.id === itemId);
  if (idx === -1) {
    const err = new Error("Checklist item not found");
    err.status = 404;
    throw err;
  }
  c.items.splice(idx, 1);
  await saveData(req, data);
  return { ok: true };
}

module.exports = {
  getChecklists,
  getChecklistById,
  createChecklist,
  importChecklists,
  updateChecklist,
  deleteChecklist,
  addItem,
  updateItem,
  deleteItem,
};
