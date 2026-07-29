# 🐟 Leks' Catfish Farm Dashboard

Real-time IoT monitoring dashboard for Pond 1. Built with React + Vite (frontend),
Node.js + Express (notification backend), and MQTT for sensor communication.

---

## 🗂 Project Structure

```
farm-dashboard/
├── src/                        React frontend
│   ├── App.jsx                 Main app — sidebar, routing, MQTT, alert engine
│   └── components/
│       ├── MetricCard.jsx      Sensor value cards
│       ├── ChartsSection.jsx   Multi-tab historical charts
│       ├── AlertsPanel.jsx     Full alert log with filters
│       └── NotifySettings.jsx  SMS / Email / WhatsApp config
├── server/                     Node.js notification backend
│   ├── index.js                Express server + MQTT subscriber
│   ├── notifier.js             Twilio, Brevo, Whapi integrations
│   ├── alertRules.js           Server-side threshold engine
│   ├── simulator.js            ← Fake sensor data for testing
│   ├── package.json
│   └── .env.example            Copy to .env and fill in your keys
├── mosquitto.conf              MQTT broker config
└── README.md
```

---

## 🌍 Online Data Connection

The app is wired to the **free public EMQX broker** (`broker.emqx.io`) by default,
so data flows over the internet with zero broker setup:

```
Sensors / Simulator ──mqtt://broker.emqx.io:1883──▶ ┌──────────────────┐
                                                    │  EMQX broker      │
Dashboard (browser) ◀─wss://broker.emqx.io:8084/mqtt┤  (public, online) │
Notification server ◀──mqtt://broker.emqx.io:1883───┘
```

- **Browser** connects over secure WebSockets (`wss://`) — required when the
  dashboard is served over HTTPS (e.g. on Render).
- **Server, simulator, and hardware** connect over plain MQTT (`mqtt://`, port 1883).
- Topics live under a farm-specific base (`leksfarm/pond1` by default). The public
  broker is shared by everyone, so set `MQTT_TOPIC_BASE` / `VITE_MQTT_TOPIC_BASE`
  to something unique to your farm — all parts must use the same value.
- To use your own private broker instead, set `MQTT_URL` (server/simulator) and
  `VITE_MQTT_URL` (frontend), or change the MQTT Broker URL on the dashboard's
  Settings page.

---

## ⚡ Quick Start (with simulator — no hardware, no broker install needed)

### Step 1 — Start the frontend

```bash
cd farm-dashboard
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

### Step 2 — Run the simulator

```bash
# In another terminal:
cd farm-dashboard/server
npm install
node simulator.js
```

The dashboard will now show live updating sensor data — streamed through the
online broker, so it works even when the dashboard and simulator run on
different machines or networks.

> **Offline / local option:** install Mosquitto and run
> `mosquitto -c mosquitto.conf`, then set `MQTT_URL=mqtt://localhost:1883` for
> the simulator/server and enter `ws://localhost:9001` as the MQTT Broker URL on
> the dashboard's Settings page.

---

## 🎭 Simulator Scenarios

Test different conditions by setting the `SCENARIO` environment variable:

```bash
# Normal healthy pond (default)
node simulator.js

# All sensors going critical — tests all alerts
SCENARIO=crisis node simulator.js

# Motion/intruder detection
SCENARIO=intruder node simulator.js

# Starts fine, slowly degrades over 5 minutes
SCENARIO=degrading node simulator.js

# Drives failed and substituted channel states
SCENARIO=faults node simulator.js

# Custom interval (e.g. every 500ms for fast testing)
INTERVAL_MS=500 node simulator.js

# On Windows (PowerShell):
$env:SCENARIO="crisis"; node simulator.js
```

---

## 📲 Setting Up Notifications (SMS / Email / WhatsApp)

### Step 1 — Copy the env file

```bash
cd server
cp .env.example .env
```

### Step 2 — Sign up for free services

| Channel   | Service         | Free Tier                      | Sign Up |
|-----------|-----------------|-------------------------------|---------|
| Email     | Brevo           | 300 emails/day forever         | https://app.brevo.com |
| SMS       | Twilio          | $15 free credit                | https://twilio.com |
| WhatsApp  | Whapi.Cloud     | Free sandbox (scan QR code)    | https://whapi.cloud |

### Step 3 — Fill in server/.env

```env
TWILIO_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=your_token
TWILIO_FROM=+15017122661
BREVO_API_KEY=xkeysib-xxxxxxxx
BREVO_FROM_EMAIL=alerts@yourdomain.com
WHAPI_TOKEN=your_whapi_token
ALERT_PHONE=+447911123456
ALERT_EMAIL=you@example.com
ALERT_WHATSAPP=+447911123456
```

### Step 4 — Start the notification server

```bash
cd server
node index.js
```

### Step 5 — Configure in dashboard

Open the dashboard → Settings page → enter your phone/email → Save.

---

## 🔌 Alert Thresholds

| Sensor            | Warning           | Critical              |
|-------------------|-------------------|-----------------------|
| Temperature       | < 24°C or > 30°C  | > 32°C                |
| pH                | —                 | < 6.0 or > 9.0        |
| Water Level       | < 70%             | —                     |
| Ammonia           | HIGH              | CRITICAL              |
| Security          | —                 | MOTION_DETECTED       |
| Oxygen risk band  | —                 | HIGH                  |
| Node silence      | —                 | No payload for 30 s   |

Alerts have a **10-minute cooldown** per rule to prevent notification spam.

---

## 🔧 Running Everything Together

Open 2 terminals (the online broker replaces local Mosquitto):

```
Terminal 1:  cd farm-dashboard && npm run dev
Terminal 2:  cd farm-dashboard/server && node simulator.js
```

Optional 3rd terminal for notifications:
```
Terminal 3:  cd farm-dashboard/server && node index.js
```

---

## 🌐 MQTT Topics

Topics are `<MQTT_TOPIC_BASE>/data` and `<MQTT_TOPIC_BASE>/alerts` (default
base: `leksfarm/pond1`).

| Topic                  | Publisher           | Subscriber        | Payload |
|------------------------|---------------------|-------------------|---------|
| `leksfarm/pond1/data`   | Sensors / Simulator | Dashboard, Server | JSON telemetry object |
| `leksfarm/pond1/alerts` | Sensors / Simulator | Dashboard, Server | `{ "status": "MOTION_DETECTED" }` |

### Example telemetry payload:
```json
{
  "sequence": 42,
  "uptime_seconds": 1260,
  "temperature": { "value": 28.4, "status": "live" },
  "ph": { "value": 7.2, "status": "live" },
  "water_level_pct": { "value": 87, "status": "live" },
  "ammonia_risk": { "value": "SAFE", "status": "live" },
  "security_status": { "value": "CLEAR", "status": "live" },
  "device_connected": { "value": true, "status": "live" },
  "pipe_status": { "value": "OK", "status": "live" },
  "pump_status": { "value": "RUNNING", "status": "live" },
  "flow_rate_lpm": { "value": 42, "status": "live" },
  "controller_battery_pct": { "value": 96, "status": "live" },
  "derived": {
    "saturation_ceiling": 13.2,
    "estimated_range": { "low": 7.8, "high": 9.4 },
    "risk_band": "LOW",
    "ph_amplitude": 0.3,
    "model_unvalidated": true
  }
}
```

---

## 📡 ESP32 / Arduino Hardware

When you're ready to connect real sensors, your microcontroller should:
1. Connect to WiFi
2. Connect to the online broker: `broker.emqx.io`, port `1883`
3. Read sensors every 2–5 seconds
4. Publish JSON to `leksfarm/pond1/data` (or your custom `MQTT_TOPIC_BASE` + `/data`)

Because the broker is online, the ESP32 at the farm and the dashboard anywhere
in the world stay connected through the internet — no port forwarding needed.

A full firmware guide can be generated on request.
