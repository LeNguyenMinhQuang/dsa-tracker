const crypto = require("crypto");
const redis = require("../config/redis");
const { USERS_KEY, LEGACY_KEY, GROUPS_KEY, LEGACY_USER_ID, userKey } = require("../config/constants");
const { todayStr } = require("../utils/dateUtils");

function newUserData() {
  return {
    settings: { newCount: 1, reviewIntervals: [3], randomCount: 1 },
    problems: {},
    days: {},
    words: {},
    checklists: {},
  };
}

async function migrate() {
  const users = await redis.get(USERS_KEY);
  if (users) return;

  const legacy = await redis.get(LEGACY_KEY);
  if (legacy) {
    const { groups, ...rest } = legacy;
    await redis.set(GROUPS_KEY, groups || {}, { nx: true });
    await redis.set(userKey(LEGACY_USER_ID), rest);
    await redis.set(USERS_KEY, [
      { id: LEGACY_USER_ID, name: "Default User", createdDate: todayStr() },
    ]);
  } else {
    await redis.set(USERS_KEY, []);
  }
}

let readyPromise = null;
function ensureReady() {
  if (!readyPromise) {
    readyPromise = migrate().catch((err) => {
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}

async function getUsers() {
  return (await redis.get(USERS_KEY)) || [];
}

async function createUser(name) {
  const trimmedName = String(name || "").trim().slice(0, 30);
  if (!trimmedName) {
    const err = new Error("User name cannot be empty");
    err.status = 400;
    throw err;
  }

  const users = (await redis.get(USERS_KEY)) || [];
  if (users.some((u) => u.name.toLowerCase() === trimmedName.toLowerCase())) {
    const err = new Error("This user name already exists");
    err.status = 400;
    throw err;
  }

  const user = { id: crypto.randomUUID(), name: trimmedName, createdDate: todayStr() };
  await redis.set(userKey(user.id), newUserData());
  users.push(user);
  await redis.set(USERS_KEY, users);
  return user;
}

module.exports = {
  newUserData,
  migrate,
  ensureReady,
  getUsers,
  createUser,
};
