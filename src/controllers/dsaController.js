const dsaService = require("../services/dsaService");
const wrap = require("../utils/asyncWrapper");

const getMonthSummary = wrap(async (req, res) => {
  const year = parseInt(req.params.year, 10);
  const month = parseInt(req.params.month, 10);
  const data = await dsaService.getMonthSummary(req, year, month);
  res.json(data);
});

const getDayDetail = wrap(async (req, res) => {
  const data = await dsaService.getDayDetail(req, req.params.date);
  res.json(data);
});

const saveNewProblem = wrap(async (req, res) => {
  const index = parseInt(req.params.index, 10);
  const problem = await dsaService.saveNewProblem(
    req,
    req.params.date,
    index,
    req.body
  );
  res.json(problem);
});

const toggleNewProblemComplete = wrap(async (req, res) => {
  const index = parseInt(req.params.index, 10);
  const problem = await dsaService.toggleNewProblemComplete(
    req,
    req.params.date,
    index,
    req.body
  );
  res.json(problem);
});

const toggleReviewComplete = wrap(async (req, res) => {
  const index = parseInt(req.params.index, 10);
  const result = await dsaService.toggleReviewComplete(
    req,
    req.params.date,
    index,
    req.body
  );
  res.json(result);
});

const toggleRandomComplete = wrap(async (req, res) => {
  const index = parseInt(req.params.index, 10);
  const result = await dsaService.toggleRandomComplete(
    req,
    req.params.date,
    index,
    req.body
  );
  res.json(result);
});

const rerollRandom = wrap(async (req, res) => {
  const index = parseInt(req.params.index, 10);
  const result = await dsaService.rerollRandom(req, req.params.date, index);
  res.json(result);
});

const getSettings = wrap(async (req, res) => {
  const settings = await dsaService.getSettings(req);
  res.json(settings);
});

const saveSettings = wrap(async (req, res) => {
  const settings = await dsaService.saveSettings(req, req.body || {});
  res.json(settings);
});

module.exports = {
  getMonthSummary,
  getDayDetail,
  saveNewProblem,
  toggleNewProblemComplete,
  toggleReviewComplete,
  toggleRandomComplete,
  rerollRandom,
  getSettings,
  saveSettings,
};
