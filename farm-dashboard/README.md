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

## ⚡ Quick Start (with simulator — no hardware needed)

### Step 1 — Install Mosquitto (MQTT broker)

| OS      | Command |
|---------|---------|
| Windows | Download installer from https://mosquitto.org/download/ |
| macOS   | `brew install mosquitto` |
| Ubuntu  | `sudo apt install mosquitto` |

### Step 2 — Start the broker

```bash
# From the farm-dashboard folder:
mosquitto -c mosquitto.conf
```

You should see:
```
1234567890: mosquitto version 2.x starting
1234567890: Opening ipv4 listen socket on port 1883
1234567890: Opening websockets listen socket on port 9001
```

### Step 3 — Start the frontend

```bash
# In a new terminal:
cd farm-dashboard
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

### Step 4 — Run the simulator

```bash
# In another new terminal:
cd farm-dashboard/server
npm install
node simulator.js
```

The dashboard will now show live updating sensor data!

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

Open 3 terminals:

```
Terminal 1:  mosquitto -c mosquitto.conf
Terminal 2:  cd farm-dashboard && npm run dev
Terminal 3:  cd farm-dashboard/server && node simulator.js
```

Optional 4th terminal for notifications:
```
Terminal 4:  cd farm-dashboard/server && node index.js
```

---

## 🌐 MQTT Topics

| Topic               | Publisher       | Subscriber         | Payload |
|---------------------|-----------------|--------------------|---------|
| `farm/pond1/data`   | Sensors / Simulator | Dashboard, Server | JSON telemetry object |
| `farm/pond1/alerts` | Sensors / Simulator | Dashboard, Server | `{ "status": "MOTION_DETECTED" }` |

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
2. Connect to the same MQTT broker (port 1883)
3. Read sensors every 2–5 seconds
4. Publish JSON to `farm/pond1/data`

A full firmware guide can be generated on request.
