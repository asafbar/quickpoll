const express = require("express");
const { register, login, logout, me } = require("../controllers/auth");
const { requireAllowedOrigin, requireOrganizer } = require("../middleware/organizerAuth");
const authRateLimit = require("../middleware/authRateLimit");
const { InvalidRegistrationError, AuthBusyError } = require("../services/auth");

const router = express.Router();
const parseJson = express.json({ limit: "4kb" });

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
router.post("/register", requireAllowedOrigin, authRateLimit, parseJson, register);
router.post("/login", requireAllowedOrigin, authRateLimit, parseJson, login);
router.post("/logout", requireAllowedOrigin, logout);
router.get("/me", requireOrganizer, me);

router.use((error, req, res, _next) => {
  if (error instanceof InvalidRegistrationError) {
    return res.status(400).json({ status: "error", message: "Provide a valid email and a password of 15 to 128 characters" });
  }
  if (error instanceof AuthBusyError) {
    return res.set("Retry-After", "1").status(429).json({ status: "error", message: "Authentication is busy. Try again shortly." });
  }
  if ([400, 413, 415].includes(error.status)) {
    return res.status(error.status).json({ status: "error", message: "Invalid authentication request body" });
  }
  console.error("Authentication request failed:", error.code);
  res.status(500).json({ status: "error", message: "Authentication request failed" });
});

module.exports = router;
