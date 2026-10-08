const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const taskRoutes = require("./routes/taskRoutes");
const recommendationRoutes = require("./routes/recommendationRoutes");
const bookRoutes = require("./routes/bookRoutes");
const chatbotRoutes = require("./routes/chatbotRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const { notFound } = require("./middleware/notFound");
const { errorHandler } = require("./middleware/errorHandler");
const teamEnv = require('./modules/team/config/env');

const app = express();
app.set('trust proxy', Number(process.env.TRUST_PROXY || 0));

app.use(
  cors((req, callback) => {
    const isTeam = req.path === '/api/team' || req.path.startsWith('/api/team/');
    callback(null, isTeam
      ? { origin: teamEnv.CORS_LIST.includes('*') ? true : teamEnv.CORS_LIST, credentials: false }
      : { origin: true, credentials: true });
  })
);
app.use(express.json({ limit: "5mb" }));

// Un solo listener; namespace propio para no colisionar con la API individual.
app.use('/api/team', require('./modules/team/app'));

app.get("/api/health", (req, res) => {
  res.json({
    service: "naatzo-main-backend",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/books", bookRoutes);
app.use("/api/chatbot", chatbotRoutes);
app.use("/api/notifications", notificationRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = { app };
