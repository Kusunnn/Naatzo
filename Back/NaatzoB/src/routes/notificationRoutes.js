const express = require("express");
const { getUserNotifications } = require("../controllers/notificationController");

const router = express.Router();
router.use(require('../services/collaborationService').requireSession);

router.get("/:userId", getUserNotifications);

module.exports = router;
