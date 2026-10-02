const redis = require("../config/redis");
const { userKey } = require("../config/constants");
const { ensureReady } = require("../services/userService");
const wrap = require("../utils/asyncWrapper");

const authMiddleware = wrap(async (req, res, next) => {
  await ensureReady();
  if (req.path === "/users" || req.path === "/groups") return next();

  const id = req.get("X-User-Id");
  const data = id ? await redis.get(userKey(id)) : null;
  if (!data) return res.status(401).json({ error: "User not selected or invalid" });

  req.userId = id;
  req.userData = data;
  next();
});

module.exports = authMiddleware;
