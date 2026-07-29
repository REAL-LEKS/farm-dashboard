/**
 * Farm Dashboard Notification Server
 * Handles SMS (Twilio), Email (Brevo), WhatsApp (Whapi.Cloud)
 * Subscribes to MQTT and fires alerts when thresholds are breached.
 *
 * Usage: node server/index.js
 */

import express from 'express';
import cors from 'cors';
import mqtt from 'mqtt';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'url';
import { sendSMS, sendEmail, sendWhatsApp } from './notifier.js';
import {
  checkAlertRules,
  normalizeTelemetry,
  getChannelValue,
  isNodeSilent,
} from './alertRules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const distDir = path.join(__dirname, '..', 'dist');

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
}

const SETTINGS_FILE = path.join(__dirname, 'settings.json');

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[Settings] Failed to load:', e.message);
  }
  return null;
}

function saveSettings(data) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('[Settings] Failed to save:', e.message);
  }
}

const cooldowns = {};
const COOLDOWN_MS = (parseInt(process.env.COOLDOWN_MINUTES) || 10) * 60 * 1000;
const NODE_SILENCE_MS = 30000;
let latestFrontendSettings = loadSettings();
let lastMqttPayloadAt = 0;
let nodeSilenceAlerted = false;

function isCoolingDown(id) {
  const last = cooldowns[id] || 0;
  return Date.now() - last < COOLDOWN_MS;
}

function setCooldown(id) {
  cooldowns[id] = Date.now();
}

async function dispatch({ message, severity, contacts, telemetry }) {
  const subject = `🚨 [${severity.toUpperCase()}] Catfish Farm Alert`;
  const body = buildEmailBody(message, telemetry);
  const smsText = `[Leks' Farm ${severity.toUpperCase()}] ${message} | Pond 1`;

  const channels = [
    { channel: 'SMS', target: contacts.phone, send: () => sendSMS(contacts.phone, smsText) },
    { channel: 'Email', target: contacts.email, send: () => sendEmail(contacts.email, subject, body) },
    { channel: 'WhatsApp', target: contacts.whatsapp, send: () => sendWhatsApp(contacts.whatsapp, smsText) },
  ];

  const settled = await Promise.allSettled(
    channels.map(c => (c.target ? c.send() : Promise.resolve(null)))
  );

  return channels.map((c, i) => {
    if (!c.target) return { channel: c.channel, status: 'skipped', detail: 'No recipient set or channel disabled' };
    const r = settled[i];
    if (r.status === 'rejected') {
      const detail = r.reason?.message || String(r.reason);
      console.error(`[${c.channel}] Failed:`, detail);
      return { channel: c.channel, status: 'failed', detail };
    }
    console.log(`[${c.channel}] Sent OK`);
    return { channel: c.channel, status: 'sent', detail: `Sent to ${c.target}` };
  });
}

function buildEmailBody(message, telemetry) {
  const rows = telemetry ? Object.entries({
    'Water Temperature': `${getChannelValue(telemetry, 'temperature')}°C`,
    'pH Level': getChannelValue(telemetry, 'ph'),
    'Water Level': `${getChannelValue(telemetry, 'water_level_pct')}%`,
    'Ammonia Risk': getChannelValue(telemetry, 'ammonia_risk'),
    'Security': getChannelValue(telemetry, 'security_status'),
    'Flow Rate': `${getChannelValue(telemetry, 'flow_rate_lpm')} L/min`,
  }).map(([k, v]) => `
          <tr>
            <td style="color:#94a3b8;padding:6px 0">${k}</td>
            <td style="color:#f1f5f9;font-weight:bold;padding:6px 0">${v ?? 'N/A'}</td>
          </tr>`).join('') : '';

  return `
    <div style="font-family:monospace;background:#0a0f1a;color:#e2e8f0;padding:24px;border-radius:12px;max-width:520px">
      <h2 style="color:#f87171;margin:0 0 16px">🚨 Farm Alert: ${message}</h2>
      <hr style="border-color:#1e293b;margin-bottom:16px"/>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        ${rows}
      </table>
      <hr style="border-color:#1e293b;margin:16px 0"/>
      <p style="color:#475569;font-size:11px;margin:0">
        Leks' Catfish Farm • Pond 1 • ${new Date().toLocaleString()}
      </p>
    </div>
  `;
}

app.post('/api/notify', async (req, res) => {
  const { alert, contacts } = req.body;
  if (!alert) return res.status(400).json({ error: 'Missing alert' });

  const resolvedContacts = contacts || latestFrontendSettings?.contacts;
  if (!resolvedContacts) return res.status(400).json({ error: 'Missing contacts' });

  const alertId = alert.id?.split('-')[0] || 'unknown';
  if (isCoolingDown(alertId)) {
    return res.json({ skipped: true, reason: 'cooldown' });
  }
  setCooldown(alertId);

  const results = await dispatch({
    message: alert.message,
    severity: alert.severity,
    contacts: resolvedContacts,
    telemetry: alert.telemetry,
  });

  res.json({ ok: results.some(r => r.status === 'sent'), results });
});

app.post('/api/report', async (req, res) => {
  const { telemetry, contacts } = req.body;
  const message = 'Manual status report requested from dashboard';
  const normalizedTelemetry = normalizeTelemetry(telemetry);

  const resolvedContacts = contacts || latestFrontendSettings?.contacts;
  if (!resolvedContacts) return res.status(400).json({ error: 'Missing contacts' });

  const results = await dispatch({ message, severity: 'info', contacts: resolvedContacts, telemetry: normalizedTelemetry });
  res.json({ ok: results.some(r => r.status === 'sent'), results });
});

app.get('/api/settings', (req, res) => {
  res.json(latestFrontendSettings || {});
});

app.post('/api/settings', (req, res) => {
  const { contacts, channels, mqttUrl } = req.body || {};
  if (!contacts) return res.status(400).json({ error: 'Missing contacts' });

  latestFrontendSettings = {
    contacts: {
      phone: contacts.phone || null,
      email: contacts.email || null,
      whatsapp: contacts.whatsapp || null,
    },
    channels: {
      smsEnabled: Boolean(channels?.smsEnabled),
      emailEnabled: Boolean(channels?.emailEnabled),
      whatsappEnabled: Boolean(channels?.whatsappEnabled),
    },
    mqttUrl: mqttUrl || null,
    updatedAt: new Date().toISOString(),
  };

  saveSettings(latestFrontendSettings);
  console.log('[API] Settings saved');
  res.json({ ok: true, updatedAt: latestFrontendSettings.updatedAt });
});

// Default to the free public EMQX broker so the deployed server receives
// online data with zero broker setup. Override with MQTT_URL for a private broker.
const mqttUrl = process.env.MQTT_URL || 'mqtt://broker.emqx.io:1883';
// Public brokers are shared — keep the topic base unique to this farm.
const topicBase = process.env.MQTT_TOPIC_BASE || 'leksfarm/pond1';
const dataTopic = `${topicBase}/data`;
const alertsTopic = `${topicBase}/alerts`;

const mqttClient = mqtt.connect(mqttUrl, {
  reconnectPeriod: 5000,
  connectTimeout: 15000,
});

mqttClient.on('connect', () => {
  console.log('[MQTT] Connected to broker:', mqttUrl);
  mqttClient.subscribe(dataTopic);
  mqttClient.subscribe(alertsTopic);
});

mqttClient.on('reconnect', () => console.log('[MQTT] Reconnecting to broker...'));
mqttClient.on('offline', () => console.warn('[MQTT] Broker connection offline'));

mqttClient.on('message', async (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    const telemetry = normalizeTelemetry(payload);
    lastMqttPayloadAt = Date.now();
    nodeSilenceAlerted = false;

    if (topic === dataTopic) {
      const triggeredRules = checkAlertRules(telemetry);

      for (const rule of triggeredRules) {
        if (isCoolingDown(rule.id)) continue;
        setCooldown(rule.id);
        console.log(`[Alert] Rule triggered: ${rule.id} — ${rule.msg}`);

        const contacts = {
          phone: process.env.ALERT_PHONE || null,
          email: process.env.ALERT_EMAIL || null,
          whatsapp: process.env.ALERT_WHATSAPP || null,
        };

        await dispatch({
          message: rule.msg,
          severity: rule.severity,
          contacts,
          telemetry,
        });
      }
    }
  } catch (e) {
    console.error('[MQTT] Parse error:', e.message);
  }
});

setInterval(async () => {
  if (!isNodeSilent(lastMqttPayloadAt, NODE_SILENCE_MS)) return;
  if (nodeSilenceAlerted || isCoolingDown('node_silence')) return;

  nodeSilenceAlerted = true;
  setCooldown('node_silence');

  const contacts = {
    phone: process.env.ALERT_PHONE || null,
    email: process.env.ALERT_EMAIL || null,
    whatsapp: process.env.ALERT_WHATSAPP || null,
  };

  await dispatch({
    message: 'No MQTT payload received for 30 seconds. Check the node power, broker link, and sensor gateway.',
    severity: 'critical',
    contacts,
    telemetry: null,
  });
}, 5000);

mqttClient.on('error', err => console.error('[MQTT] Error:', err.message));

app.get('/health', (_, res) => res.json({ ok: true, uptime: process.uptime() }));

app.get('/ping', (_, res) => res.json({
  pong: true,
  uptime: process.uptime(),
  mqtt: mqttClient.connected ? 'connected' : 'disconnected',
  lastPayloadAgoSeconds: lastMqttPayloadAt ? Math.round((Date.now() - lastMqttPayloadAt) / 1000) : null,
}));

// Render's free tier spins the service down after ~15 minutes without inbound
// traffic; while asleep the MQTT listener is dead and no alerts fire. Pinging
// our own public URL counts as traffic and keeps the service awake.
// RENDER_EXTERNAL_URL is set automatically by Render.
const keepAliveUrl = (process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
const KEEP_ALIVE_MS = (parseInt(process.env.KEEP_ALIVE_MINUTES) || 10) * 60 * 1000;

if (keepAliveUrl) {
  setInterval(async () => {
    try {
      const res = await fetch(`${keepAliveUrl}/ping`);
      if (!res.ok) console.warn(`[KeepAlive] Ping returned HTTP ${res.status}`);
    } catch (e) {
      console.warn('[KeepAlive] Ping failed:', e.message);
    }
  }, KEEP_ALIVE_MS);
}

app.get('*', (_, res) => {
  const indexPath = path.join(distDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
    return;
  }

  res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Leks' Farm Backend</title>
    <style>
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
        background: #0a0f1a;
        color: #e2e8f0;
        display: grid;
        place-items: center;
        min-height: 100vh;
      }
      .card {
        width: min(760px, 92vw);
        background: #0d1526;
        border: 1px solid #1e293b;
        border-radius: 14px;
        padding: 22px;
      }
      h1 {
        margin: 0 0 10px;
        font-size: 20px;
      }
      p {
        margin: 0 0 16px;
        color: #94a3b8;
      }
      ul {
        margin: 0;
        padding-left: 18px;
      }
      li { margin: 8px 0; }
      a {
        color: #34d399;
        text-decoration: none;
      }
      a:hover { text-decoration: underline; }
      code {
        background: #0b1220;
        border: 1px solid #1e293b;
        border-radius: 6px;
        padding: 2px 6px;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Leks' Farm Notification Backend</h1>
      <p>Server is running. Use the endpoints below:</p>
      <ul>
        <li><a href="/health">/health</a> <code>GET</code> server health</li>
        <li><a href="/api/settings">/api/settings</a> <code>GET</code> load saved settings</li>
        <li><code>/api/settings</code> <code>POST</code> save notification settings</li>
        <li><code>/api/notify</code> <code>POST</code> send alert notifications</li>
        <li><code>/api/report</code> <code>POST</code> send manual report</li>
      </ul>
    </div>
  </body>
</html>`);
});

app.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const localIp = Object.values(nets).flat().find(n => n.family === 'IPv4' && !n.internal)?.address || 'localhost';
  console.log(`\n🐟 Leks' Farm Notification Server`);
  console.log(`   Local:     http://localhost:${PORT}`);
  console.log(`   Network:   http://${localIp}:${PORT}  ← use this for remote access`);
  console.log(`   SMS:       ${process.env.TWILIO_SID ? '✅ Twilio configured' : '⚠️  TWILIO_SID not set'}`);
  console.log(`   Email:     ${process.env.BREVO_API_KEY ? '✅ Brevo configured' : '⚠️  BREVO_API_KEY not set'}`);
  console.log(`   WhatsApp:  ${process.env.WHAPI_TOKEN ? '✅ Whapi configured' : '⚠️  WHAPI_TOKEN not set'}`);
  console.log(`   MQTT:      ${mqttUrl}`);
  console.log(`   Topics:    ${dataTopic}, ${alertsTopic}`);
  console.log(`   Settings:  ${latestFrontendSettings ? 'loaded from file' : 'no saved settings'}`);
  console.log(`   KeepAlive: ${keepAliveUrl ? `pinging ${keepAliveUrl}/ping every ${KEEP_ALIVE_MS / 60000}m` : 'off (set KEEP_ALIVE_URL to enable)'}\n`);
});