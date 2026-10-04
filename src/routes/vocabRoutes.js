const express = require("express");
const vocabController = require("../controllers/vocabController");

const router = express.Router();

router.get("/groups", vocabController.getGroups);
router.post("/groups", vocabController.createGroup);
router.get("/words", vocabController.getWords);
router.post("/words", vocabController.createWord);
router.put("/words/:id", vocabController.updateWord);
router.delete("/words/:id", vocabController.deleteWord);
router.post("/words/:id/status", vocabController.setWordStatus);

module.exports = router;
