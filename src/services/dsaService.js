const crypto = require("crypto");
const redis = require("../config/redis");
const { userKey } = require("../config/constants");
const { todayStr, addDays } = require("../utils/dateUtils");

async function loadData(req) {
  const data = req.userData;
  if (!data.words) data.words = {};
  if (!data.checklists) data.checklists = {};

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

async function saveData(req, data) {
  await redis.set(userKey(req.userId), data);
}

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

function assignTasks(data, date) {
  const day = ensureDay(data, date);

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

async function getMonthSummary(req, year, month) {
  const data = await loadData(req);
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
  await saveData(req, data);
  return { days: result, today: t };
}

async function getDayDetail(req, date) {
  const data = await loadData(req);
  const t = todayStr();
  if (date <= t) assignTasks(data, date);
  await saveData(req, data);

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

  return {
    date,
    isFuture: date > t,
    isToday: date === t,
    newProblems,
    reviews,
    randoms,
  };
}

async function saveNewProblem(req, date, index, body) {
  const data = await loadData(req);
  const { name, difficulty, starred, note } = body;
  if (!name || !name.trim()) {
    const err = new Error("Problem name cannot be empty");
    err.status = 400;
    throw err;
  }

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
  await saveData(req, data);
  return problem;
}

async function toggleNewProblemComplete(req, date, index, body) {
  const data = await loadData(req);
  const day = data.days[date];
  const slot = day && day.newSlots[index];
  if (!slot || !slot.problemId) {
    const err = new Error("No problem found at this slot");
    err.status = 404;
    throw err;
  }
  const problem = data.problems[slot.problemId];
  problem.completed =
    body.completed !== undefined ? !!body.completed : !problem.completed;
  await saveData(req, data);
  return problem;
}

async function toggleReviewComplete(req, date, index, body) {
  const data = await loadData(req);
  const day = data.days[date];
  const slot = day && day.reviewSlots[index];
  if (!slot || !slot.problemId) {
    const err = new Error("No review task found at this slot");
    err.status = 404;
    throw err;
  }
  slot.completed =
    body.completed !== undefined ? !!body.completed : !slot.completed;
  await saveData(req, data);
  return { completed: slot.completed };
}

async function toggleRandomComplete(req, date, index, body) {
  const data = await loadData(req);
  const day = data.days[date];
  const slot = day && day.randomSlots[index];
  if (!slot || !slot.problemId) {
    const err = new Error("No random task found at this slot");
    err.status = 404;
    throw err;
  }
  slot.completed =
    body.completed !== undefined ? !!body.completed : !slot.completed;
  await saveData(req, data);
  return { completed: slot.completed };
}

async function rerollRandom(req, date, index) {
  const data = await loadData(req);
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
  if (pool.length === 0) {
    const err = new Error("No alternative problem available for reroll");
    err.status = 404;
    throw err;
  }
  const pick = pool[Math.floor(Math.random() * pool.length)];
  day.randomSlots[index] = { problemId: pick.id, completed: false };
  await saveData(req, data);
  return { problem: pick, completed: false };
}

async function getSettings(req) {
  const data = await loadData(req);
  return data.settings;
}

async function saveSettings(req, body) {
  const data = await loadData(req);
  const { newCount, reviewIntervals, randomCount } = body;

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

  await saveData(req, data);
  return data.settings;
}

module.exports = {
  loadData,
  saveData,
  getMonthSummary,
  getDayDetail,
  saveNewProblem,
  toggleNewProblemComplete,
  toggleReviewComplete,
  toggleRandomComplete,
  rerollRandom,
  getSettings,
  saveSettings,
};
