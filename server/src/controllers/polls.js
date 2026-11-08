const pollService = require("../services/polls");

async function createPoll(req, res) {
  try {
    const poll = await pollService.createPoll(req.body);
    if (!poll) {
      return res.status(503).json({
        status: "error",
        message: "Could not allocate a join code. Please try again.",
      });
    }

    res.status(201).json(poll);
  } catch (error) {
    if (error instanceof pollService.InvalidPollError) {
      return res.status(400).json({ status: "error", message: error.message });
    }

    console.error("Poll creation failed:", error);
    res.status(500).json({ status: "error", message: "Could not create poll" });
  }
}

module.exports = { createPoll };
