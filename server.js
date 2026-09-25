const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { Redis } = require("@upstash/redis");

const HOST = "0.0.0.0";
const PORT = process.env.PORT || 3131;
const DATA_KEY = "dsa-tracker-data";

// Đọc UPSTASH_REDIS_REST_URL và UPSTASH_REDIS_REST_TOKEN từ biến môi trường
const redis = Redis.fromEnv();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- Data helpers ----------
async function loadData() {
  let data = await redis.get(DATA_KEY);
  if (!data) {
    const initial = {
      settings: { newCount: 1, reviewIntervals: [3], randomCount: 1 },
      problems: {},
      days: {},
      groups: {},
      words: {},
      checklists: {},
    };
    await redis.set(DATA_KEY, initial);
    return initial;
  }
  if (!data.words) data.words = {}; // migration cho data.json tạo trước khi có tính năng từ vựng
  if (!data.groups) data.groups = {}; // migration cho data.json tạo trước khi có nhóm chủ đề TOEIC
  if (!data.checklists) data.checklists = {}; // migration cho data.json tạo trước khi có tính năng checklist

  // migration: cấu hình số lượng bài/ngày (trước đây chỉ có 1 bài mới / 1 ôn / 1 random cố định)
  if (!data.settings) data.settings = {};
  if (!data.settings.newCount) data.settings.newCount = 1;
  if (
    !Array.isArray(data.settings.reviewIntervals) ||
    data.settings.reviewIntervals.length === 0
  ) {
    const legacy = data.settings.reviewIntervalDays || 3;
    data.settings.reviewIntervals = [legacy];
  }
  if (
    data.settings.randomCount === undefined ||
    data.settings.randomCount === null
  ) {
    data.settings.randomCount = 1;
  }
  delete data.settings.reviewIntervalDays;

  return data;
}

async function saveData(data) {
  await redis.set(DATA_KEY, data);
}

function todayStr() {
  const d = new Date();
  return fmt(d);
}

function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return fmt(dt);
}

// Ensure a day record exists, in the current (slot-based) shape.
// - Brand-new days snapshot the CURRENT global settings (newCount / reviewIntervals / randomCount)
//   so that changing settings later never retroactively changes past days.
// - Days created before this feature (legacy shape: newProblemId / reviewProblemId / ...)
//   are migrated in place into a single new/review/random slot each, keeping their data untouched.
function ensureDay(data, date) {
  let day = data.days[date];

  if (!day) {
    day = {
      newSlots: [],
      reviewSlots: [],
      randomSlots: [],
      newCount: data.settings.newCount,
      reviewIntervals: [...data.settings.reviewIntervals],
      randomCount: data.settings.randomCount,
    };
    data.days[date] = day;
  } else if (!day.newSlots) {
    // legacy day, created before multi-slot support existed
    const legacyInterval = data.settings.reviewIntervals[0] || 3;
    day = {
      newSlots: day.newProblemId ? [{ problemId: day.newProblemId }] : [],
      reviewSlots: day.reviewProblemId
        ? [
            {
              intervalDays: legacyInterval,
              problemId: day.reviewProblemId,
              completed: !!day.reviewCompleted,
            },
          ]
        : [],
      randomSlots: day.randomProblemId
        ? [{ problemId: day.randomProblemId, completed: !!day.randomCompleted }]
        : [],
      newCount: 1,
      reviewIntervals: [legacyInterval],
      randomCount: 1,
    };
    data.days[date] = day;
  }

  return day;
}

// Fill in any missing review / random slots for a date (only for date <= today).
// New-problem slots are never auto-filled — those are created manually via the form.
function assignTasks(data, date) {
  const day = ensureDay(data, date);

  // Review slots: one per entry in day.reviewIntervals (locked in when the day was created)
  day.reviewIntervals.forEach((intervalDays, i) => {
    if (!day.reviewSlots[i]) {
      const refDate = addDays(date, -intervalDays);
      const candidate = Object.values(data.problems).find(
        (p) => p.date === refDate,
      );
      day.reviewSlots[i] = {
        intervalDays,
        problemId: candidate ? candidate.id : null,
        completed: false,
      };
    }
  });

  // Random slots: day.randomCount slots, avoiding duplicates with review/other random slots
  const usedIds = new Set(
    [
      ...day.reviewSlots.map((s) => s.problemId),
      ...day.randomSlots.map((s) => s.problemId),
    ].filter(Boolean),
  );
  for (let i = 0; i < day.randomCount; i++) {
    if (!day.randomSlots[i]) {
      const pool = Object.values(data.problems).filter(
        (p) => p.date < date && !usedIds.has(p.id),
      );
      let pick = null;
      if (pool.length > 0) {
        pick = pool[Math.floor(Math.random() * pool.length)];
        usedIds.add(pick.id);
      }
      day.randomSlots[i] = {
        problemId: pick ? pick.id : null,
        completed: false,
      };
    }
  }

  return day;
}

function dayStatus(data, date) {
  const t = todayStr();
  if (date > t) return "future";
  const day = data.days[date];
  if (date === t) return "today";
  // past date
  if (!day) return "incomplete";

  const newSlots = day.newSlots || [];
  const reviewSlots = day.reviewSlots || [];
  const randomSlots = day.randomSlots || [];

  const newDone = newSlots.every(
    (s) => !s.problemId || !!data.problems[s.problemId]?.completed,
  );
  const reviewDone = reviewSlots.every((s) => !s.problemId || s.completed);
  const randomDone = randomSlots.every((s) => !s.problemId || s.completed);

  const hasAnyTask =
    newSlots.some((s) => s.problemId) ||
    reviewSlots.some((s) => s.problemId) ||
    randomSlots.some((s) => s.problemId);

  if (!hasAnyTask) return "incomplete";
  return newDone && reviewDone && randomDone ? "complete" : "incomplete";
}

// ---------- Routes ----------

// Month summary: array of { date, status, difficulty, starred }
app.get("/api/month/:year/:month", async (req, res) => {
  const data = await loadData();
  const year = parseInt(req.params.year, 10);
  const month = parseInt(req.params.month, 10); // 1-12
  const daysInMonth = new Date(year, month, 0).getDate();
  const result = [];
  const t = todayStr();

  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (date <= t) assignTasks(data, date);
    const status = dayStatus(data, date);

    const day = data.days[date];
    let difficulty = null;
    let starred = false;
    if (day && day.newSlots) {
      for (const slot of day.newSlots) {
        const p = slot && slot.problemId ? data.problems[slot.problemId] : null;
        if (p) {
          if (!difficulty) difficulty = p.difficulty;
          if (p.starred) starred = true;
        }
      }
    }

    result.push({ date, status, difficulty, starred });
  }
  await saveData(data);
  res.json({ days: result, today: t });
});

// Day detail
app.get("/api/day/:date", async (req, res) => {
  const data = await loadData();
  const { date } = req.params;
  const t = todayStr();
  if (date <= t) assignTasks(data, date);
  await saveData(data);

  const day = ensureDay(data, date);

  const newCount = Math.max(day.newCount, day.newSlots.length);
  const newProblems = [];
  for (let i = 0; i < newCount; i++) {
    const slot = day.newSlots[i];
    newProblems.push(
      slot && slot.problemId ? data.problems[slot.problemId] : null,
    );
  }

  const reviews = day.reviewSlots.map((slot) => {
    const p = slot.problemId ? data.problems[slot.problemId] : null;
    return {
      problem: p,
      completed: slot.completed,
      refDate: p ? p.date : null,
      intervalDays: slot.intervalDays,
    };
  });

  const randoms = day.randomSlots.map((slot) => {
    const p = slot.problemId ? data.problems[slot.problemId] : null;
    return {
      problem: p,
      completed: slot.completed,
      refDate: p ? p.date : null,
    };
  });

  res.json({
    date,
    isFuture: date > t,
    isToday: date === t,
    newProblems,
    reviews,
    randoms,
  });
});

// Create / update a "new problem" slot for a date
app.post("/api/day/:date/new/:index", async (req, res) => {
  const data = await loadData();
  const { date } = req.params;
  const index = parseInt(req.params.index, 10);
  const { name, difficulty, starred, note } = req.body;
  if (!name || !name.trim())
    return res.status(400).json({ error: "Tên bài tập không được để trống" });

  const day = ensureDay(data, date);
  while (day.newSlots.length <= index) day.newSlots.push(null);

  const existingId = day.newSlots[index] && day.newSlots[index].problemId;
  let problem;
  if (existingId && data.problems[existingId]) {
    problem = data.problems[existingId];
    problem.name = name.trim();
    problem.difficulty = difficulty || "medium";
    problem.starred = !!starred;
    problem.note = note || "";
  } else {
    const id = crypto.randomUUID();
    problem = {
      id,
      name: name.trim(),
      difficulty: difficulty || "medium",
      starred: !!starred,
      note: note || "",
      date,
      completed: false,
    };
    data.problems[id] = problem;
    day.newSlots[index] = { problemId: id };
  }
  await saveData(data);
  res.json(problem);
});

// Toggle complete for a "new problem" slot
app.post("/api/day/:date/new/:index/complete", async (req, res) => {
  const data = await loadData();
  const { date } = req.params;
  const index = parseInt(req.params.index, 10);
  const day = data.days[date];
  const slot = day && day.newSlots[index];
  if (!slot || !slot.problemId)
    return res.status(404).json({ error: "Chưa có bài mới ở vị trí này" });
  const problem = data.problems[slot.problemId];
  problem.completed =
    req.body.completed !== undefined
      ? !!req.body.completed
      : !problem.completed;
  await saveData(data);
  res.json(problem);
});

// Toggle review completion for a given review slot index
app.post("/api/day/:date/review/:index/complete", async (req, res) => {
  const data = await loadData();
  const { date } = req.params;
  const index = parseInt(req.params.index, 10);
  const day = data.days[date];
  const slot = day && day.reviewSlots[index];
  if (!slot || !slot.problemId)
    return res.status(404).json({ error: "Không có bài ôn tập ở vị trí này" });
  slot.completed =
    req.body.completed !== undefined ? !!req.body.completed : !slot.completed;
  await saveData(data);
  res.json({ completed: slot.completed });
});

// Toggle random completion for a given random slot index
app.post("/api/day/:date/random/:index/complete", async (req, res) => {
  const data = await loadData();
  const { date } = req.params;
  const index = parseInt(req.params.index, 10);
  const day = data.days[date];
  const slot = day && day.randomSlots[index];
  if (!slot || !slot.problemId)
    return res.status(404).json({ error: "Không có bài random ở vị trí này" });
  slot.completed =
    req.body.completed !== undefined ? !!req.body.completed : !slot.completed;
  await saveData(data);
  res.json({ completed: slot.completed });
});

// Reroll a given random slot index
app.post("/api/day/:date/random/:index/reroll", async (req, res) => {
  const data = await loadData();
  const { date } = req.params;
  const index = parseInt(req.params.index, 10);
  const day = ensureDay(data, date);
  while (day.randomSlots.length <= index)
    day.randomSlots.push({ problemId: null, completed: false });

  const usedIds = new Set(
    [
      ...day.reviewSlots.map((s) => s.problemId),
      ...day.randomSlots
        .map((s, i) => (i !== index ? s.problemId : null))
        .filter(Boolean),
    ].filter(Boolean),
  );
  const pool = Object.values(data.problems).filter(
    (p) => p.date < date && !usedIds.has(p.id),
  );
  if (pool.length === 0)
    return res.status(404).json({ error: "Không còn bài nào khác để đổi" });
  const pick = pool[Math.floor(Math.random() * pool.length)];
  day.randomSlots[index] = { problemId: pick.id, completed: false };
  await saveData(data);
  res.json({ problem: pick, completed: false });
});

// Settings
app.get("/api/settings", async (req, res) => {
  const data = await loadData();
  res.json(data.settings);
});

app.post("/api/settings", async (req, res) => {
  const data = await loadData();
  const { newCount, reviewIntervals, randomCount } = req.body;

  if (newCount !== undefined && parseInt(newCount, 10) >= 0) {
    data.settings.newCount = parseInt(newCount, 10);
  }
  if (Array.isArray(reviewIntervals)) {
    const cleaned = reviewIntervals
      .map((n) => parseInt(n, 10))
      .filter((n) => n > 0);
    if (cleaned.length > 0) data.settings.reviewIntervals = cleaned;
  }
  if (randomCount !== undefined && parseInt(randomCount, 10) >= 0) {
    data.settings.randomCount = parseInt(randomCount, 10);
  }

  await saveData(data);
  res.json(data.settings);
});

// ---------- Vocabulary ----------

function validMeanings(meanings) {
  if (!Array.isArray(meanings) || meanings.length === 0) return null;
  const cleaned = meanings
    .map((m) => ({
      definition: (m.definition || "").trim(),
      explain: (m.explain || "").trim(),
      example: (m.example || "").trim(),
    }))
    .filter((m) => m.definition);
  return cleaned.length > 0 ? cleaned : null;
}

// List all topic groups (used to tag/filter vocabulary)
app.get("/api/groups", async (req, res) => {
  const data = await loadData();
  const groups = Object.values(data.groups || {}).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  res.json(groups);
});

// List all words
app.get("/api/words", async (req, res) => {
  const data = await loadData();
  const words = Object.values(data.words).sort((a, b) =>
    a.term.localeCompare(b.term),
  );
  res.json(words);
});

// Create a word
app.post("/api/words", async (req, res) => {
  const data = await loadData();
  const { term, pronunciation, groupId, meanings } = req.body;
  if (!term || !term.trim())
    return res.status(400).json({ error: "Từ không được để trống" });
  const cleaned = validMeanings(meanings);
  if (!cleaned)
    return res.status(400).json({ error: "Cần ít nhất 1 nghĩa có định nghĩa" });

  const id = crypto.randomUUID();
  const word = {
    id,
    term: term.trim(),
    pronunciation: (pronunciation || "").trim(),
    groupId: groupId || null,
    meanings: cleaned,
    status: "unsure",
    createdDate: todayStr(),
    lastReviewed: null,
    reviewCount: 0,
  };
  data.words[id] = word;
  await saveData(data);
  res.json(word);
});

// Update a word (term + pronunciation + group + meanings)
app.put("/api/words/:id", async (req, res) => {
  const data = await loadData();
  const word = data.words[req.params.id];
  if (!word) return res.status(404).json({ error: "Không tìm thấy từ" });
  const { term, pronunciation, groupId, meanings } = req.body;
  if (term && term.trim()) word.term = term.trim();
  if (pronunciation !== undefined)
    word.pronunciation = (pronunciation || "").trim();
  if (groupId !== undefined) word.groupId = groupId || null;
  const cleaned = validMeanings(meanings);
  if (cleaned) word.meanings = cleaned;
  await saveData(data);
  res.json(word);
});

// Delete a word
app.delete("/api/words/:id", async (req, res) => {
  const data = await loadData();
  if (!data.words[req.params.id])
    return res.status(404).json({ error: "Không tìm thấy từ" });
  delete data.words[req.params.id];
  await saveData(data);
  res.json({ ok: true });
});

// Set status: known / unsure / review
app.post("/api/words/:id/status", async (req, res) => {
  const data = await loadData();
  const word = data.words[req.params.id];
  if (!word) return res.status(404).json({ error: "Không tìm thấy từ" });
  const { status } = req.body;
  if (status !== "known" && status !== "unsure" && status !== "review")
    return res.status(400).json({ error: "status không hợp lệ" });
  word.status = status;
  word.lastReviewed = todayStr();
  word.reviewCount = (word.reviewCount || 0) + 1;
  await saveData(data);
  res.json(word);
});

// ---------- Checklists ----------

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

// List checklists (summary only)
app.get("/api/checklists", async (req, res) => {
  const data = await loadData();
  const list = Object.values(data.checklists).sort((a, b) =>
    (b.createdDate || "").localeCompare(a.createdDate || ""),
  );
  res.json(list.map(checklistSummary));
});

// Get one checklist (full, with items)
app.get("/api/checklists/:id", async (req, res) => {
  const data = await loadData();
  const c = data.checklists[req.params.id];
  if (!c) return res.status(404).json({ error: "Không tìm thấy checklist" });
  res.json(c);
});

// Create an empty checklist manually
app.post("/api/checklists", async (req, res) => {
  const data = await loadData();
  const { name } = req.body;
  if (!name || !name.trim())
    return res.status(400).json({ error: "Tên checklist không được để trống" });
  const id = crypto.randomUUID();
  const checklist = {
    id,
    name: name.trim(),
    createdDate: todayStr(),
    items: [],
  };
  data.checklists[id] = checklist;
  await saveData(data);
  res.json(checklist);
});

// Import one checklist, or many, from JSON
// Accepts: { name, items: [...] }  OR  { checklists: [ { name, items }, ... ] }
app.post("/api/checklists/import", async (req, res) => {
  const data = await loadData();
  const body = req.body || {};
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
    return res.status(400).json({
      error:
        'JSON không hợp lệ. Cần dạng { "name": "...", "items": [...] } và mỗi checklist phải có \'name\'.',
    });
  }
  await saveData(data);
  res.json({ imported: created.length, checklists: created });
});

// Rename a checklist
app.put("/api/checklists/:id", async (req, res) => {
  const data = await loadData();
  const c = data.checklists[req.params.id];
  if (!c) return res.status(404).json({ error: "Không tìm thấy checklist" });
  const { name } = req.body;
  if (name && name.trim()) c.name = name.trim();
  await saveData(data);
  res.json(c);
});

// Delete a checklist
app.delete("/api/checklists/:id", async (req, res) => {
  const data = await loadData();
  if (!data.checklists[req.params.id])
    return res.status(404).json({ error: "Không tìm thấy checklist" });
  delete data.checklists[req.params.id];
  await saveData(data);
  res.json({ ok: true });
});

// Add an item to a checklist
app.post("/api/checklists/:id/items", async (req, res) => {
  const data = await loadData();
  const c = data.checklists[req.params.id];
  if (!c) return res.status(404).json({ error: "Không tìm thấy checklist" });
  const { text } = req.body;
  if (!text || !text.trim())
    return res.status(400).json({ error: "Nội dung mục không được để trống" });
  const item = { id: crypto.randomUUID(), text: text.trim(), checked: false };
  c.items.push(item);
  await saveData(data);
  res.json(item);
});

// Update an item: toggle checked and/or edit text
app.put("/api/checklists/:id/items/:itemId", async (req, res) => {
  const data = await loadData();
  const c = data.checklists[req.params.id];
  if (!c) return res.status(404).json({ error: "Không tìm thấy checklist" });
  const item = c.items.find((i) => i.id === req.params.itemId);
  if (!item) return res.status(404).json({ error: "Không tìm thấy mục" });
  if (req.body.text !== undefined && req.body.text.trim())
    item.text = req.body.text.trim();
  if (req.body.checked !== undefined) item.checked = !!req.body.checked;
  else if (req.body.toggle) item.checked = !item.checked;
  await saveData(data);
  res.json(item);
});

// Delete an item
app.delete("/api/checklists/:id/items/:itemId", async (req, res) => {
  const data = await loadData();
  const c = data.checklists[req.params.id];
  if (!c) return res.status(404).json({ error: "Không tìm thấy checklist" });
  const idx = c.items.findIndex((i) => i.id === req.params.itemId);
  if (idx === -1) return res.status(404).json({ error: "Không tìm thấy mục" });
  c.items.splice(idx, 1);
  await saveData(data);
  res.json({ ok: true });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`DSA Tracker đang chạy tại http://${HOST}:${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(
      "App đã đang chạy sẵn ở cổng " +
        PORT +
        ". Mở trình duyệt tới http://localhost:" +
        PORT,
    );
    process.exit(0);
  } else {
    throw err;
  }
});
