const express = require("express");
const authMiddleware = require("../middleware/auth");
const userRoutes = require("./userRoutes");
const adminRoutes = require("./adminRoutes");
const dsaRoutes = require("./dsaRoutes");
const vocabRoutes = require("./vocabRoutes");
const discoverRoutes = require("./discoverRoutes");
const checklistRoutes = require("./checklistRoutes");

const router = express.Router();

router.use(authMiddleware);
router.use(userRoutes);
router.use(adminRoutes);
router.use(dsaRoutes);
router.use(vocabRoutes);
router.use(discoverRoutes);
router.use(checklistRoutes);

module.exports = router;
