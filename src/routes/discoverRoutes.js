const express = require("express");
const discoverController = require("../controllers/discoverController");

const router = express.Router();

router.post("/discover", discoverController.discoverWords);

module.exports = router;
