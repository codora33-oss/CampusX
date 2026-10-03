import express from "express";
import cors from "cors";

const app = express();
const port = Number(process.env.PORT || 10000);

app.use(cors({ origin: process.env.FRONTEND_URL || true, credentials: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "campusconnect-api", timestamp: new Date().toISOString() });
});

app.get("/api", (_req, res) => {
  res.json({ name: "CampusConnect API", version: "1.0.0" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`CampusConnect API listening on ${port}`);
});
