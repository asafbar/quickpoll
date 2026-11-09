const express = require("express");
const { listOrganizerPolls } = require("../controllers/polls");
const { requireOrganizer } = require("../middleware/organizerAuth");

const router = express.Router();
router.get("/polls", requireOrganizer, listOrganizerPolls);

module.exports = router;
