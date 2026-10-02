const express = require("express");
const dsaController = require("../controllers/dsaController");

const router = express.Router();

router.get("/month/:year/:month", dsaController.getMonthSummary);
router.get("/day/:date", dsaController.getDayDetail);
router.post("/day/:date/new/:index", dsaController.saveNewProblem);
router.post("/day/:date/new/:index/complete", dsaController.toggleNewProblemComplete);
router.post("/day/:date/review/:index/complete", dsaController.toggleReviewComplete);
router.post("/day/:date/random/:index/complete", dsaController.toggleRandomComplete);
router.post("/day/:date/random/:index/reroll", dsaController.rerollRandom);
router.get("/settings", dsaController.getSettings);
router.post("/settings", dsaController.saveSettings);

module.exports = router;
