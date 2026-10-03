const crypto = require("crypto");
const { promisify } = require("util");
const redis = require("../config/redis");
const {
  USERS_KEY,
  LEGACY_KEY,
  GROUPS_KEY,
  LEGACY_USER_ID,
  userKey,
  SESSION_TTL_SECONDS,
  LOGIN_MAX_FAILS,
  LOGIN_LOCK_SECONDS,
  sessionKey,
  userSessionsKey,
  loginFailKey,
} = require("../config/constants");
const { todayStr } = require("../utils/dateUtils");

const scrypt = promisify(crypto.scrypt);
const ROLES = ["admin", "user"];
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 100;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function newUserData() {
  return {
    settings: { newCount: 1, reviewIntervals: [3], randomCount: 1 },
    problems: {},
    days: {},
    words: {},
    checklists: {},
  };
}

/* ------------------------------ passwords ----------------------------- */

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const [alg, saltHex, hashHex] = String(stored || "").split("$");
  if (alg !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function validatePassword(password) {
  if (
    typeof password !== "string" ||
    password.length < MIN_PASSWORD ||
    password.length > MAX_PASSWORD
  ) {
    throw httpError(400, `Password must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters`);
  }
}

/* ------------------------------- startup ------------------------------ */

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

/* --------------------------------- users ------------------------------ */

async function getUsersFull() {
  return (await redis.get(USERS_KEY)) || [];
}

const publicUser = (u) => ({ id: u.id, name: u.name, createdDate: u.createdDate });
const adminUser = (u) => ({
  id: u.id,
  name: u.name,
  createdDate: u.createdDate,
  role: u.role === "admin" ? "admin" : "user",
  hasPassword: !!u.passwordHash,
});
const isAdminUser = (u) => u.role === "admin";

// Public list used by the login screen: never exposes hashes or roles
async function getUsers() {
  return (await getUsersFull()).map(publicUser);
}

async function listUsersAdmin() {
  return (await getUsersFull())
    .map(adminUser)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function createUser(name, password, role) {
  const trimmedName = String(name || "").trim().slice(0, 30);
  if (!trimmedName) throw httpError(400, "User name cannot be empty");
  validatePassword(password);
  const finalRole = role === undefined || role === "" ? "user" : role;
  if (!ROLES.includes(finalRole)) throw httpError(400, "Invalid role");

  const users = await getUsersFull();
  if (users.some((u) => u.name.toLowerCase() === trimmedName.toLowerCase())) {
    throw httpError(400, "This user name already exists");
  }

  const user = {
    id: crypto.randomUUID(),
    name: trimmedName,
    createdDate: todayStr(),
    role: finalRole,
    passwordHash: await hashPassword(password),
  };
  await redis.set(userKey(user.id), newUserData());
  users.push(user);
  await redis.set(USERS_KEY, users);
  return adminUser(user);
}

async function deleteUser(id, actorId) {
  if (id === actorId) throw httpError(400, "You cannot delete your own account");
  const users = await getUsersFull();
  const target = users.find((u) => u.id === id);
  if (!target) throw httpError(404, "User not found");
  if (isAdminUser(target) && users.filter(isAdminUser).length <= 1) {
    throw httpError(400, "Cannot delete the last admin");
  }

  await redis.set(
    USERS_KEY,
    users.filter((u) => u.id !== id),
  );
  await redis.del(userKey(id));
  await invalidateSessions(id);
  await redis.del(loginFailKey(id));
  return { ok: true };
}

// keepToken: the caller's own session, so changing your own password does not log you out
async function setPassword(id, password, keepToken) {
  validatePassword(password);
  const users = await getUsersFull();
  const target = users.find((u) => u.id === id);
  if (!target) throw httpError(404, "User not found");

  target.passwordHash = await hashPassword(password);
  await redis.set(USERS_KEY, users);
  await invalidateSessions(id, keepToken);
  await redis.del(loginFailKey(id)); // also unlocks a locked-out user
  return { ok: true };
}

// Not exposed over HTTP: used by scripts/setPassword.js
async function setUserRole(id, role) {
  if (!ROLES.includes(role)) throw httpError(400, "Invalid role");
  const users = await getUsersFull();
  const target = users.find((u) => u.id === id);
  if (!target) throw httpError(404, "User not found");
  target.role = role;
  await redis.set(USERS_KEY, users);
  await invalidateSessions(id);
  return adminUser(target);
}

/* -------------------------------- sessions ---------------------------- */

async function login(userId, password) {
  const users = await getUsersFull();
  const user = users.find((u) => u.id === userId);
  if (!user) throw httpError(401, "Invalid user or password");

  const failKey = loginFailKey(user.id);
  const fails = Number((await redis.get(failKey)) || 0);
  if (fails >= LOGIN_MAX_FAILS) {
    throw httpError(429, "Too many failed attempts. Try again in a few minutes.");
  }
  if (!user.passwordHash) {
    throw httpError(403, "This profile has no password yet. Ask an admin to set one.");
  }

  const ok =
    typeof password === "string" &&
    password.length <= MAX_PASSWORD &&
    (await verifyPassword(password, user.passwordHash));
  if (!ok) {
    const n = await redis.incr(failKey);
    if (n === 1) await redis.expire(failKey, LOGIN_LOCK_SECONDS);
    throw httpError(401, "Incorrect password");
  }
  await redis.del(failKey);

  const role = isAdminUser(user) ? "admin" : "user";
  const token = crypto.randomBytes(32).toString("hex");
  await redis.set(sessionKey(token), { userId: user.id, role }, { ex: SESSION_TTL_SECONDS });
  await redis.sadd(userSessionsKey(user.id), token);
  await redis.expire(userSessionsKey(user.id), SESSION_TTL_SECONDS);
  return { token, user: { id: user.id, name: user.name, role } };
}

async function getSession(token) {
  if (!token || token.length > 200) return null;
  const s = await redis.get(sessionKey(token));
  return s && s.userId ? s : null;
}

async function logout(token, userId) {
  if (!token) return;
  await redis.del(sessionKey(token));
  if (userId) await redis.srem(userSessionsKey(userId), token);
}

async function invalidateSessions(userId, exceptToken) {
  const tokens = ((await redis.smembers(userSessionsKey(userId))) || []).map(String);
  const toDelete = tokens.filter((t) => t !== exceptToken);
  if (toDelete.length === 0) return;
  await redis.del(...toDelete.map(sessionKey));
  await redis.srem(userSessionsKey(userId), ...toDelete);
}

module.exports = {
  newUserData,
  migrate,
  ensureReady,
  getUsers,
  getUsersFull,
  listUsersAdmin,
  createUser,
  deleteUser,
  setPassword,
  setUserRole,
  login,
  logout,
  getSession,
  invalidateSessions,
};
