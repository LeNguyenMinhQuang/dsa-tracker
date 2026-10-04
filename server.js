require("dotenv").config();

const express = require("express");
const path = require("path");
const apiRoutes = require("./src/routes");
const errorHandler = require("./src/middleware/errorHandler");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = process.env.PORT || 3131;

const app = express();

app.use(express.json({ limit: "6mb" })); // admin image upload sends a resized data URL
app.use(express.static(path.join(__dirname, "public")));

// API Routes
app.use("/api", apiRoutes);

// Global Error Handler
app.use(errorHandler);

const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 DSA Tracker running at http://${HOST}:${PORT}`);
  // Illustrations are NOT generated automatically. An admin starts the queue
  // with the "Generate missing images" button (Settings > Admin).
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(
      `Port ${PORT} is already in use. Access the app at http://localhost:${PORT}`,
    );
    process.exit(0);
  } else {
    throw err;
  }
});
