const discoverService = require("../services/discoverService");
const wrap = require("../utils/asyncWrapper");

const discoverWords = wrap(async (req, res) => {
  const results = await discoverService.discoverWords(req, req.body || {});
  res.json(results);
});

module.exports = {
  discoverWords,
};
