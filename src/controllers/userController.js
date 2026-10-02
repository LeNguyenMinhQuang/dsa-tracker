const userService = require("../services/userService");
const wrap = require("../utils/asyncWrapper");

const getUsers = wrap(async (req, res) => {
  const users = await userService.getUsers();
  res.json(users);
});

const createUser = wrap(async (req, res) => {
  const user = await userService.createUser(req.body && req.body.name);
  res.json(user);
});

module.exports = {
  getUsers,
  createUser,
};
