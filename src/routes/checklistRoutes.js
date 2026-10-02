const express = require("express");
const checklistController = require("../controllers/checklistController");

const router = express.Router();

router.get("/checklists", checklistController.getChecklists);
router.get("/checklists/:id", checklistController.getChecklistById);
router.post("/checklists", checklistController.createChecklist);
router.post("/checklists/import", checklistController.importChecklists);
router.put("/checklists/:id", checklistController.updateChecklist);
router.delete("/checklists/:id", checklistController.deleteChecklist);
router.post("/checklists/:id/items", checklistController.addItem);
router.put("/checklists/:id/items/:itemId", checklistController.updateItem);
router.delete("/checklists/:id/items/:itemId", checklistController.deleteItem);

module.exports = router;
