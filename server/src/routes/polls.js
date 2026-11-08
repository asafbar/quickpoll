const express = require("express");
const { createPoll } = require("../controllers/polls");

const router = express.Router();
const bodyErrors = {
  400: "Invalid JSON request body",
  413: "Request body is too large",
  415: "Unsupported request encoding",
};

router.post("/", express.json(), createPoll, (error, req, res, _next) => {
  const message = bodyErrors[error.status];
  if (!message) {
    console.error("Poll request parsing failed:", error);
    return res.status(500).json({ status: "error", message: "Could not create poll" });
  }

  res.status(error.status).json({ status: "error", message });
});

module.exports = router;
