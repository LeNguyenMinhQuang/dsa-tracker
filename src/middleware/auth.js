const redis = require("../config/redis");
const { userKey } = require("../config/constants");
const { ensureReady, getSession } = require("../services/userService");
const wrap = require("../utils/asyncWrapper");

// Routes that work without a session
function isPublic(req) {
  const p = req.path;
  return (
    (req.method === "GET" && p === "/users") || // names on the login screen
    (req.method === "GET" && p === "/groups") ||
    (req.method === "POST" && p === "/login")
  );
}

const authMiddleware = wrap(async (req, res, next) => {
  await ensureReady();
  if (isPublic(req)) return next();

  const header = req.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const session = token ? await getSession(token) : null;
  if (!session)
    return res.status(401).json({ error: "Not signed in or session expired" });

  const data = await redis.get(userKey(session.userId));
  if (!data) return res.status(401).json({ error: "User not found" });

  req.userId = session.userId;
  req.userRole = session.role;
  req.userData = data;
  req.token = token;
  next();
});

function requireAdmin(req, res, next) {
  if (req.userRole !== "admin") {
    return res.status(403).json({ error: "Admin permission required" });
  }
  next();
}

module.exports = authMiddleware;
module.exports.requireAdmin = requireAdmin;
