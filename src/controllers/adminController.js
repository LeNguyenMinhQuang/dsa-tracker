const userService = require("../services/userService");
const imageService = require("../services/imageService");
const wrap = require("../utils/asyncWrapper");

const listUsers = wrap(async (req, res) => {
  res.json(await userService.listUsersAdmin());
});

const createUser = wrap(async (req, res) => {
  const { name, password, role } = req.body || {};
  res.json(await userService.createUser(name, password, role));
});

const deleteUser = wrap(async (req, res) => {
  res.json(await userService.deleteUser(req.params.id, req.userId));
});

const setPassword = wrap(async (req, res) => {
  // Changing your own password keeps your current session alive
  const keepToken = req.params.id === req.userId ? req.token : null;
  res.json(
    await userService.setPassword(req.params.id, req.body && req.body.password, keepToken),
  );
});

const imageStatus = wrap(async (req, res) => {
  res.json(await imageService.getStatus());
});

const imageBackfill = wrap(async (req, res) => {
  const retryFailed = !!(req.body && req.body.retryFailed);
  const stats = await imageService.backfillAll({ force: retryFailed });
  imageService.resume();
  res.json({ ...stats, status: await imageService.getStatus() });
});

module.exports = {
  listUsers,
  createUser,
  deleteUser,
  setPassword,
  imageStatus,
  imageBackfill,
};
