require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const httpServer = http.createServer(app);

const PORT = process.env.PORT || 3001;
const pool = require("./src/config/db");
const { corsOptions } = require("./src/config/auth");
const authRoutes = require("./src/routes/auth");
const organizerRoutes = require("./src/routes/organizer");
const pollRoutes = require("./src/routes/polls");
const { attachPollSockets } = require("./src/sockets/polls");

app.use(cors(corsOptions));
app.use("/api/auth", authRoutes);
app.use("/api/organizer", organizerRoutes);
app.use("/api/polls", pollRoutes);
app.use(express.json());

const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
  },
});
attachPollSockets(io);

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "QuickPoll API",
  });
});

app.get("/api/health/db", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT current_database() AS database, NOW() AS server_time"
    );

    res.json({
      status: "ok",
      database: result.rows[0].database,
      serverTime: result.rows[0].server_time,
    });
  } catch (error) {
    console.error("Database health check failed:", error.message);

    res.status(503).json({
      status: "error",
      message: "Database unavailable",
    });
  }
});

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`QuickPoll server running on port ${PORT}`);
});
