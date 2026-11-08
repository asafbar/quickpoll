const express = require("express");
const { createPoll, getPollByCode, joinPoll } = require("../controllers/polls");

const router = express.Router();
const bodyErrors = {
  400: "Invalid JSON request body",
  413: "Request body is too large",
  415: "Unsupported request encoding",
};

function handleBodyError(fallbackMessage) {
  return (error, req, res, _next) => {
    const message = bodyErrors[error.status];
    if (!message) {
      console.error("Poll request parsing failed:", error);
      return res.status(500).json({ status: "error", message: fallbackMessage });
    }

    res.status(error.status).json({ status: "error", message });
  };
}

const parseJson = express.json();
router.post("/", parseJson, createPoll, handleBodyError("Could not create poll"));
router.get("/code/:joinCode", getPollByCode);
router.post("/code/:joinCode/join", parseJson, joinPoll, handleBodyError("Could not join poll"));

module.exports = router;
