const pollService = require("../services/polls");

function bearerToken(req) {
  return /^Bearer +([A-Za-z0-9._~+/-]+=*)$/i.exec(req.get("Authorization"))?.[1];
}

async function createPoll(req, res) {
  try {
    const poll = await pollService.createPoll(req.body);
    if (!poll) {
      return res.status(503).json({
        status: "error",
        message: "Could not allocate a join code. Please try again.",
      });
    }

    res.set("Cache-Control", "no-store").status(201).json(poll);
  } catch (error) {
    if (error instanceof pollService.InvalidPollError) {
      return res.status(400).json({ status: "error", message: error.message });
    }

    console.error("Poll creation failed:", error.code);
    res.status(500).json({ status: "error", message: "Could not create poll" });
  }
}

async function getPollByCode(req, res) {
  try {
    const poll = await pollService.getPollByCode(req.params.joinCode);
    if (!poll) {
      return res.status(404).json({ status: "error", message: "Poll not found" });
    }

    res.json(poll);
  } catch (error) {
    console.error("Poll lookup failed:", error);
    res.status(500).json({ status: "error", message: "Could not look up poll" });
  }
}

async function joinPoll(req, res) {
  try {
    const participant = await pollService.joinPoll(req.params.joinCode, req.body);
    if (!participant) {
      return res.status(404).json({ status: "error", message: "Poll not found" });
    }

    res.status(201).json(participant);
  } catch (error) {
    if (error instanceof pollService.InvalidPollError) {
      return res.status(400).json({ status: "error", message: error.message });
    }
    if (error instanceof pollService.PollNotActiveError) {
      return res.status(409).json({ status: "error", message: error.message });
    }

    console.error("Poll join failed:", error.message);
    res.status(500).json({ status: "error", message: "Could not join poll" });
  }
}

function changePollStatus(nextStatus) {
  return async (req, res) => {
    const token = bearerToken(req);
    if (!token) {
      return res.set("WWW-Authenticate", "Bearer").status(401).json({
        status: "error",
        message: "Organizer bearer token required",
      });
    }

    try {
      const poll = await pollService.changePollStatus(req.params.id, token, nextStatus);
      if (!poll) {
        return res.status(404).json({ status: "error", message: "Poll not found" });
      }

      res.json(poll);
    } catch (error) {
      if (error instanceof pollService.OrganizerForbiddenError) {
        return res.status(403).json({ status: "error", message: error.message });
      }
      if (error instanceof pollService.PollTransitionError) {
        return res.status(409).json({ status: "error", message: error.message });
      }

      console.error("Poll status update failed:", error.code);
      res.status(500).json({ status: "error", message: "Could not update poll status" });
    }
  };
}

async function castVote(req, res) {
  const token = bearerToken(req);
  if (!token) {
    return res.set("WWW-Authenticate", "Bearer").status(401).json({
      status: "error",
      message: "Participant bearer token required",
    });
  }

  try {
    const vote = await pollService.castVote(req.params.joinCode, token, req.body);
    if (!vote) return res.status(404).json({ status: "error", message: "Poll not found" });
    res.status(201).json(vote);
  } catch (error) {
    if (error instanceof pollService.InvalidPollError) {
      return res.status(400).json({ status: "error", message: error.message });
    }
    if (error instanceof pollService.ParticipantForbiddenError) {
      return res.status(403).json({ status: "error", message: error.message });
    }
    if (error instanceof pollService.PollNotActiveError || error instanceof pollService.DuplicateVoteError) {
      return res.status(409).json({ status: "error", message: error.message });
    }
    console.error("Vote failed:", error.code);
    res.status(500).json({ status: "error", message: "Could not record vote" });
  }
}

async function getResults(req, res) {
  try {
    const results = await pollService.getResults(req.params.joinCode);
    if (!results) return res.status(404).json({ status: "error", message: "Poll not found" });
    res.json(results);
  } catch (error) {
    if (error instanceof pollService.ResultsUnavailableError) {
      return res.status(409).json({ status: "error", message: error.message });
    }
    console.error("Results lookup failed:", error.code);
    res.status(500).json({ status: "error", message: "Could not load results" });
  }
}

module.exports = {
  createPoll,
  getPollByCode,
  joinPoll,
  activatePoll: changePollStatus("active"),
  closePoll: changePollStatus("closed"),
  castVote,
  getResults,
};
