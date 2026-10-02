const vocabService = require("../services/vocabService");
const wrap = require("../utils/asyncWrapper");

const getGroups = wrap(async (req, res) => {
  const groups = await vocabService.getGroups();
  res.json(groups);
});

const getWords = wrap(async (req, res) => {
  const words = await vocabService.getWords(req);
  res.json(words);
});

const createWord = wrap(async (req, res) => {
  const word = await vocabService.createWord(req, req.body || {});
  res.json(word);
});

const updateWord = wrap(async (req, res) => {
  const word = await vocabService.updateWord(req, req.params.id, req.body || {});
  res.json(word);
});

const deleteWord = wrap(async (req, res) => {
  const result = await vocabService.deleteWord(req, req.params.id);
  res.json(result);
});

const setWordStatus = wrap(async (req, res) => {
  const word = await vocabService.setWordStatus(
    req,
    req.params.id,
    req.body && req.body.status
  );
  res.json(word);
});

module.exports = {
  getGroups,
  getWords,
  createWord,
  updateWord,
  deleteWord,
  setWordStatus,
};
