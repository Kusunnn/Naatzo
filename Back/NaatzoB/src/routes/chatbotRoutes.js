const express = require("express");
const {
  health,
  ask,
  upload,
  listMessages,
} = require("../controllers/chatbotController");

const router = express.Router();
const { receiveFile } = require('../modules/team/utils/documents');
const { requireSession } = require('../services/collaborationService');

router.get("/health", health);
router.post("/chat", ask);
router.post("/files", requireSession, receiveFile, upload);
router.get("/chat/:userId", listMessages);

module.exports = router;
