const express = require("express");
const adminController = require("../controllers/adminController");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

// Everything under /api/admin requires the admin role
router.use("/admin", requireAdmin);

router.get("/admin/users", adminController.listUsers);
router.post("/admin/users", adminController.createUser);
router.delete("/admin/users/:id", adminController.deleteUser);
router.put("/admin/users/:id/password", adminController.setPassword);

router.get("/admin/images/status", adminController.imageStatus);
router.post("/admin/images/backfill", adminController.imageBackfill);
router.post("/admin/images/stop", adminController.imageStop);
router.delete("/admin/images/all", adminController.imageDeleteAll);
router.delete("/admin/images", adminController.imageDeleteOne);

module.exports = router;
