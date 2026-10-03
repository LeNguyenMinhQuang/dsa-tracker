const express = require("express");
const userController = require("../controllers/userController");

const router = express.Router();

router.get("/users", userController.getUsers);
router.post("/login", userController.login);
router.post("/logout", userController.logout);

module.exports = router;
