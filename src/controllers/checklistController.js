const checklistService = require("../services/checklistService");
const wrap = require("../utils/asyncWrapper");

const getChecklists = wrap(async (req, res) => {
  const checklists = await checklistService.getChecklists(req);
  res.json(checklists);
});

const getChecklistById = wrap(async (req, res) => {
  const checklist = await checklistService.getChecklistById(req, req.params.id);
  res.json(checklist);
});

const createChecklist = wrap(async (req, res) => {
  const checklist = await checklistService.createChecklist(
    req,
    req.body && req.body.name
  );
  res.json(checklist);
});

const importChecklists = wrap(async (req, res) => {
  const result = await checklistService.importChecklists(req, req.body || {});
  res.json(result);
});

const updateChecklist = wrap(async (req, res) => {
  const checklist = await checklistService.updateChecklist(
    req,
    req.params.id,
    req.body && req.body.name
  );
  res.json(checklist);
});

const deleteChecklist = wrap(async (req, res) => {
  const result = await checklistService.deleteChecklist(req, req.params.id);
  res.json(result);
});

const addItem = wrap(async (req, res) => {
  const item = await checklistService.addItem(
    req,
    req.params.id,
    req.body && req.body.text
  );
  res.json(item);
});

const updateItem = wrap(async (req, res) => {
  const item = await checklistService.updateItem(
    req,
    req.params.id,
    req.params.itemId,
    req.body || {}
  );
  res.json(item);
});

const deleteItem = wrap(async (req, res) => {
  const result = await checklistService.deleteItem(
    req,
    req.params.id,
    req.params.itemId
  );
  res.json(result);
});

module.exports = {
  getChecklists,
  getChecklistById,
  createChecklist,
  importChecklists,
  updateChecklist,
  deleteChecklist,
  addItem,
  updateItem,
  deleteItem,
};
