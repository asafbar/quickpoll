const express = require("express");
const { listOrganizerPolls } = require("../controllers/polls");
const { requireOrganizer } = require("../middleware/organizerAuth");
const { organizerSessions } = require("./sessions");

const router = express.Router();
router.get("/polls", requireOrganizer, listOrganizerPolls);
router.use("/sessions", organizerSessions);

module.exports = router;
