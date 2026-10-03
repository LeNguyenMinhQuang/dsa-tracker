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
    await userService.setPassword(
      req.params.id,
      req.body && req.body.password,
      keepToken,
    ),
  );
});

const imageStatus = wrap(async (req, res) => {
  res.json(await imageService.getStatus());
});

const imageBackfill = wrap(async (req, res) => {
  const retryFailed = !!(req.body && req.body.retryFailed);
  const stats = await imageService.backfillAll({ force: retryFailed });
  // Manual start: the queue only runs when an admin asks for it
  const started =
    (await imageService.pendingCount()) > 0 && imageService.start();
  res.json({ ...stats, started, status: await imageService.getStatus() });
});

const imageStop = wrap(async (req, res) => {
  imageService.stop();
  res.json(await imageService.getStatus());
});

const imageDeleteOne = wrap(async (req, res) => {
  res.json(
    await imageService.deleteImage(
      req.query.term || (req.body && req.body.term),
    ),
  );
});

const imageDeleteAll = wrap(async (req, res) => {
  const r = await imageService.deleteAllImages();
  res.json({ ...r, status: await imageService.getStatus() });
});

module.exports = {
  listUsers,
  createUser,
  deleteUser,
  setPassword,
  imageStatus,
  imageBackfill,
  imageStop,
  imageDeleteOne,
  imageDeleteAll,
};
