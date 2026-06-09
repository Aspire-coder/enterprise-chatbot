// routes/admin.js
import express from "express";
import { readChatEvents, readHandoffEvents } from "../utils/logger.js";
import { escapeHtml, formatDuration }        from "../utils/helpers.js";
import { reloadI18nContent }                 from "../services/languageService.js";
import { loadCountryConfig }                 from "../services/bedrockService.js";

export const adminRouter = express.Router();

// ── Auth guard ─────────────────────────────────────────────────────────────
const adminGuard = (req, res, next) => {
  const token = req.headers["x-admin-token"] ?? req.query.token;
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

// ── JSON data endpoints ────────────────────────────────────────────────────
adminRouter.get("/insights", adminGuard, (_req, res) => {
  res.json(readChatEvents());
});

adminRouter.get("/handoffs", adminGuard, (_req, res) => {
  res.json(readHandoffEvents());
});

// ── Hot-reload endpoint ────────────────────────────────────────────────────
// Call this after updating any S3 config/i18n file
// No server restart needed
adminRouter.post("/reload-config", adminGuard, async (_req, res) => {
  try {
    // Reset all in-memory caches — forces fresh S3 load on next request
    await reloadI18nContent();

    // Also bust the country config cache in bedrockService
    // by importing and resetting it
    const bedrockModule = await import("../services/bedrockService.js");
    if (bedrockModule._resetCountryConfig) {
      bedrockModule._resetCountryConfig();
    }

    res.json({ success: true, message: "Config reloaded from S3" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── HTML dashboard ─────────────────────────────────────────────────────────
adminRouter.get("/dashboard", adminGuard, (_req, res) => {
  const events   = readChatEvents();
  const handoffs = readHandoffEvents();

  const total   = events.length;
  const blocked = events.filter((e) => e.outcome === "blocked").length;
  const errors  = events.filter((e) => e.outcome === "error").length;
  const avgMs   = total
    ? Math.round(events.reduce((s, e) => s + (e.durationMs ?? 0), 0) / total)
    : 0;

  // Queries by country
  const byCountry = {};
  events.forEach((e) => {
    if (e.selectedCountry) {
      byCountry[e.selectedCountry] = (byCountry[e.selectedCountry] ?? 0) + 1;
    }
  });

  // Queries by compliance type
  const byCompliance = {};
  events
    .filter((e) => e.outcome === "blocked")
    .forEach((e) => {
      if (e.complianceType) {
        byCompliance[e.complianceType] = (byCompliance[e.complianceType] ?? 0) + 1;
      }
    });

  const countryRows = Object.entries(byCountry)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `<tr><td>${escapeHtml(c)}</td><td>${n}</td></tr>`)
    .join("");

  const complianceRows = Object.entries(byCompliance)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `<tr><td>${escapeHtml(t)}</td><td>${n}</td></tr>`)
    .join("");

  const handoffRows = handoffs
    .slice(-20)
    .reverse()
    .map((h) => `
      <tr>
        <td>${escapeHtml(h.ts?.slice(0, 16).replace("T", " ") ?? "")}</td>
        <td>${escapeHtml(h.selectedCountry ?? "")}</td>
        <td>${escapeHtml(h.reason ?? "")}</td>
        <td>${escapeHtml(h.question ?? "")}</td>
      </tr>`)
    .join("");

  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ASK Vera V2 — Admin</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body   { font-family: system-ui, sans-serif; background: #f4f5f7; color: #172b4d; padding: 32px; }
    h1     { font-size: 1.4rem; font-weight: 700; margin-bottom: 24px; }
    h2     { font-size: .95rem; font-weight: 600; color: #5e6c84; margin: 32px 0 10px; text-transform: uppercase; letter-spacing: .05em; }
    .kpis  { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px; margin-bottom: 8px; }
    .kpi   { background: #fff; border-radius: 8px; padding: 20px 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .kpi-v { font-size: 2rem; font-weight: 700; line-height: 1; }
    .kpi-l { font-size: .75rem; color: #7a869a; margin-top: 6px; }
    table  { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 8px; }
    th     { background: #0052cc; color: #fff; padding: 10px 14px; text-align: left; font-size: .8rem; font-weight: 600; }
    td     { padding: 10px 14px; border-bottom: 1px solid #f0f0f0; font-size: .85rem; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #f8f9fa; }
    .reload { margin-top: 32px; }
    .reload button { background: #0052cc; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; font-size: .85rem; cursor: pointer; }
    .reload button:hover { background: #0747a6; }
    #reload-msg { margin-left: 12px; font-size: .85rem; color: #36b37e; }
  </style>
</head>
<body>
  <h1>ASK Vera V2 — Admin Dashboard</h1>

  <div class="kpis">
    <div class="kpi"><div class="kpi-v">${total}</div><div class="kpi-l">Total Queries</div></div>
    <div class="kpi"><div class="kpi-v">${blocked}</div><div class="kpi-l">Compliance Blocks</div></div>
    <div class="kpi"><div class="kpi-v">${errors}</div><div class="kpi-l">Errors</div></div>
    <div class="kpi"><div class="kpi-v">${formatDuration(avgMs)}</div><div class="kpi-l">Avg Response Time</div></div>
    <div class="kpi"><div class="kpi-v">${handoffs.length}</div><div class="kpi-l">Handoff Events</div></div>
  </div>

  <h2>Queries by Country</h2>
  <table>
    <thead><tr><th>Country</th><th>Queries</th></tr></thead>
    <tbody>${countryRows || "<tr><td colspan='2'>No data yet</td></tr>"}</tbody>
  </table>

  <h2>Compliance Blocks by Type</h2>
  <table>
    <thead><tr><th>Type</th><th>Count</th></tr></thead>
    <tbody>${complianceRows || "<tr><td colspan='2'>No blocks yet</td></tr>"}</tbody>
  </table>

  <h2>Recent Handoffs (last 20)</h2>
  <table>
    <thead><tr><th>Time</th><th>Country</th><th>Reason</th><th>Question</th></tr></thead>
    <tbody>${handoffRows || "<tr><td colspan='4'>No handoffs yet</td></tr>"}</tbody>
  </table>

  <div class="reload">
    <button onclick="reloadConfig()">🔄 Reload S3 Config</button>
    <span id="reload-msg"></span>
  </div>

  <script>
    async function reloadConfig() {
      const msg = document.getElementById("reload-msg");
      msg.style.color = "#7a869a";
      msg.textContent = "Reloading...";
      try {
        const res  = await fetch("/api/admin/reload-config", {
          method:  "POST",
          headers: { "x-admin-token": new URLSearchParams(location.search).get("token") ?? "" },
        });
        const data = await res.json();
        msg.style.color = data.success ? "#36b37e" : "#de350b";
        msg.textContent = data.success ? "✓ Reloaded successfully" : "✗ " + data.error;
      } catch (e) {
        msg.style.color = "#de350b";
        msg.textContent = "✗ Request failed";
      }
    }
  </script>
</body>
</html>`);
});