const userService = require("../services/userService");
const wrap = require("../utils/asyncWrapper");

const getUsers = wrap(async (req, res) => {
  res.json(await userService.getUsers());
});

const login = wrap(async (req, res) => {
  const { userId, password } = req.body || {};
  res.json(await userService.login(userId, password));
});

const logout = wrap(async (req, res) => {
  await userService.logout(req.token, req.userId);
  res.json({ ok: true });
});

module.exports = {
  getUsers,
  login,
  logout,
};
