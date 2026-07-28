/**
 * simulator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Simulates pond sensors publishing to MQTT using the nested channel payload.
 * Run this instead of real hardware to test the full dashboard + notifications.
 *
 * Usage: node simulator.js
 *
 * Options (env vars):
 *   MQTT_URL=mqtt://localhost:1883   (default)
 *   INTERVAL_MS=2000                 (publish every 2s by default)
 *   SCENARIO=normal|crisis|intruder|faults
 */

import mqtt from 'mqtt';

const MQTT_URL = process.env.MQTT_URL || 'mqtt://localhost:1883';
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS, 10) || 2000;
const SCENARIO = process.env.SCENARIO || 'normal';

const client = mqtt.connect(MQTT_URL);

const sin = (t, period, amp, mid) => mid + amp * Math.sin((2 * Math.PI * t) / period);
const noise = amount => (Math.random() - 0.5) * amount;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = (value, digits = 2) => Number.parseFloat(value.toFixed(digits));

const bootAt = Date.now();
let sequence = 0;
let elapsedSeconds = 0;
let phHistory = [];

const live = value => ({ value, status: 'live' });
const substituted = (value, ageSeconds) => ({ value, status: 'substituted', age_seconds: ageSeconds });
const stale = (value, ageSeconds) => ({ value, status: 'stale', age_seconds: ageSeconds });
const failed = () => ({ value: null, status: 'failed', age_seconds: null });

function oxygenSaturationCeiling(temperatureC) {
  const ceiling = 14.62 - (0.41 * temperatureC);
  return round(clamp(ceiling, 4.5, 14.6), 1);
}

function oxygenEstimatedRange(temperatureC, phAmplitude, waterLevelPct) {
  const ceiling = oxygenSaturationCeiling(temperatureC);
  const penalty = clamp((temperatureC - 26) * 0.18 + phAmplitude * 0.15 + Math.max(0, 75 - waterLevelPct) * 0.02, 0, 5.5);
  const high = clamp(ceiling - Math.max(0.2, penalty * 0.45), 0, ceiling);
  const low = clamp(high - Math.max(0.8, penalty), 0, high);
  return {
    low: round(low, 1),
    high: round(high, 1),
  };
}

function oxygenRiskBand(range) {
  if (range.low < 4) return 'HIGH';
  if (range.low < 6) return 'MODERATE';
  return 'LOW';
}

function updatePhHistory(value, timestampMs) {
  if (Number.isFinite(value)) {
    phHistory.push({ timestampMs, value });
  }

  const cutoff = timestampMs - (24 * 60 * 60 * 1000);
  phHistory = phHistory.filter(sample => sample.timestampMs >= cutoff);
}

function getPhAmplitude() {
  if (phHistory.length === 0) return 0;
  const values = phHistory.map(sample => sample.value);
  return Math.max(...values) - Math.min(...values);
}

function buildDerived(rawValues) {
  const temperature = Number.isFinite(rawValues.temperature) ? rawValues.temperature : 28;
  const waterLevelPct = Number.isFinite(rawValues.water_level_pct) ? rawValues.water_level_pct : 85;
  const phAmplitude = getPhAmplitude();
  const estimatedRange = oxygenEstimatedRange(temperature, phAmplitude, waterLevelPct);

  return {
    saturation_ceiling: oxygenSaturationCeiling(temperature),
    estimated_range: estimatedRange,
    risk_band: oxygenRiskBand(estimatedRange),
    ph_amplitude: round(phAmplitude, 2),
    model_unvalidated: true,
  };
}

function buildPayload(channelValues) {
  const rawValues = {};
  const payload = {
    sequence,
    uptime_seconds: Math.max(0, Math.floor((Date.now() - bootAt) / 1000)),
    derived: {},
  };

  Object.entries(channelValues).forEach(([field, channel]) => {
    payload[field] = channel;
    rawValues[field] = channel?.value;

    if (Number.isFinite(channel?.value)) {
      rawValues[field] = channel.value;
    }

    if (field === 'ph') {
      updatePhHistory(channel?.value, Date.now());
    }
  });

  payload.derived = buildDerived(rawValues);
  return payload;
}

const scenarioState = {
  temperature: 28.2,
  ph: 7.2,
  water_level_pct: 87,
  ammonia_risk: 'SAFE',
  security_status: 'CLEAR',
  device_connected: true,
  pipe_status: 'OK',
  pump_status: 'RUNNING',
  flow_rate_lpm: 42,
  controller_battery_pct: 96,
};

const SCENARIOS = {
  normal: t => {
    const temperature = round(sin(t, 3600, 2, 28) + noise(0.3));
    const ph = round(sin(t, 7200, 0.4, 7.2) + noise(0.05));
    const waterLevel = round(sin(t, 10800, 5, 87) + noise(0.5), 1);
    const flowRate = round(sin(t, 2700, 6, 42) + noise(1.2), 1);

    scenarioState.temperature = temperature;
    scenarioState.ph = ph;
    scenarioState.water_level_pct = waterLevel;
    scenarioState.ammonia_risk = 'SAFE';
    scenarioState.security_status = 'CLEAR';
    scenarioState.device_connected = true;
    scenarioState.pipe_status = 'OK';
    scenarioState.pump_status = 'RUNNING';
    scenarioState.flow_rate_lpm = flowRate;
    scenarioState.controller_battery_pct = Math.max(75, Math.round(100 - t / 1200));

    return buildPayload({
      temperature: live(temperature),
      ph: live(ph),
      water_level_pct: live(waterLevel),
      ammonia_risk: live('SAFE'),
      security_status: live('CLEAR'),
      device_connected: live(true),
      pipe_status: live('OK'),
      pump_status: live('RUNNING'),
      flow_rate_lpm: live(flowRate),
      controller_battery_pct: live(scenarioState.controller_battery_pct),
    });
  },
  crisis: t => {
    const temperature = round(sin(t, 600, 4, 33) + noise(0.5));
    const ph = round(sin(t, 900, 1.5, 5.5) + noise(0.1));
    const waterLevel = round(clamp(sin(t, 1800, 10, 65) + noise(1), 0, 100), 1);
    const flowRate = round(clamp(sin(t, 400, 6, 12) + noise(1.5), 0, 60), 1);

    scenarioState.temperature = temperature;
    scenarioState.ph = ph;
    scenarioState.water_level_pct = waterLevel;
    scenarioState.ammonia_risk = t % 30 < 15 ? 'CRITICAL' : 'HIGH';
    scenarioState.security_status = 'CLEAR';
    scenarioState.device_connected = t % 80 < 10 ? false : true;
    scenarioState.pipe_status = t % 50 < 25 ? 'BROKEN' : 'LEAK';
    scenarioState.pump_status = t % 40 < 20 ? 'FAILED' : 'RUNNING';
    scenarioState.flow_rate_lpm = flowRate;
    scenarioState.controller_battery_pct = Math.max(12, Math.round(28 - t / 600));

    return buildPayload({
      temperature: live(temperature),
      ph: live(ph),
      water_level_pct: live(waterLevel),
      ammonia_risk: live(scenarioState.ammonia_risk),
      security_status: live('CLEAR'),
      device_connected: live(scenarioState.device_connected),
      pipe_status: live(scenarioState.pipe_status),
      pump_status: live(scenarioState.pump_status),
      flow_rate_lpm: live(flowRate),
      controller_battery_pct: live(scenarioState.controller_battery_pct),
    });
  },
  intruder: t => {
    const temperature = round(sin(t, 3600, 2, 28) + noise(0.3));
    const ph = round(sin(t, 7200, 0.4, 7.2) + noise(0.05));
    const waterLevel = round(sin(t, 10800, 5, 87) + noise(0.5), 1);
    const flowRate = round(sin(t, 2700, 6, 40) + noise(1.3), 1);

    scenarioState.temperature = temperature;
    scenarioState.ph = ph;
    scenarioState.water_level_pct = waterLevel;
    scenarioState.ammonia_risk = 'SAFE';
    scenarioState.security_status = t % 20 < 10 ? 'MOTION_DETECTED' : 'CLEAR';
    scenarioState.device_connected = true;
    scenarioState.pipe_status = 'OK';
    scenarioState.pump_status = 'RUNNING';
    scenarioState.flow_rate_lpm = flowRate;
    scenarioState.controller_battery_pct = Math.max(60, Math.round(92 - t / 1600));

    return buildPayload({
      temperature: live(temperature),
      ph: live(ph),
      water_level_pct: live(waterLevel),
      ammonia_risk: live('SAFE'),
      security_status: live(scenarioState.security_status),
      device_connected: live(true),
      pipe_status: live('OK'),
      pump_status: live('RUNNING'),
      flow_rate_lpm: live(flowRate),
      controller_battery_pct: live(scenarioState.controller_battery_pct),
    });
  },
  faults: t => {
    const liveTemperature = round(sin(t, 3600, 1.2, 29) + noise(0.2));
    const livePh = round(sin(t, 7200, 0.3, 7.1) + noise(0.05));
    const liveWater = round(clamp(82 + noise(1), 0, 100), 1);
    const liveFlow = round(clamp(31 + noise(1), 0, 60), 1);
    const liveBattery = Math.max(40, Math.round(88 - t / 2400));

    scenarioState.temperature = liveTemperature;
    scenarioState.ph = livePh;
    scenarioState.water_level_pct = liveWater;
    scenarioState.ammonia_risk = 'HIGH';
    scenarioState.security_status = 'CLEAR';
    scenarioState.device_connected = false;
    scenarioState.pipe_status = 'LEAK';
    scenarioState.pump_status = 'FAILED';
    scenarioState.flow_rate_lpm = liveFlow;
    scenarioState.controller_battery_pct = liveBattery;

    return buildPayload({
      temperature: substituted(liveTemperature, 126),
      ph: failed(),
      water_level_pct: live(liveWater),
      ammonia_risk: substituted('HIGH', 44),
      security_status: live('CLEAR'),
      device_connected: failed(),
      pipe_status: substituted('LEAK', 91),
      pump_status: failed(),
      flow_rate_lpm: stale(liveFlow, 45),
      controller_battery_pct: substituted(liveBattery, 63),
    });
  },
};

client.on('connect', () => {
  console.log(`\n🐟 Leks' Farm Simulator`);
  console.log(`   MQTT:     ${MQTT_URL}`);
  console.log(`   Scenario: ${SCENARIO}`);
  console.log(`   Interval: ${INTERVAL_MS}ms`);
  console.log(`\n   Press Ctrl+C to stop.\n`);
  console.log('─'.repeat(60));

  const scenarioFn = SCENARIOS[SCENARIO] || SCENARIOS.normal;

  const publish = () => {
    const payload = scenarioFn(elapsedSeconds);
    client.publish('farm/pond1/data', JSON.stringify(payload), { retain: true });

    if (payload.security_status?.value === 'MOTION_DETECTED') {
      client.publish('farm/pond1/alerts', JSON.stringify({ status: 'MOTION_DETECTED' }));
    }

    const now = new Date().toLocaleTimeString();
    const temperature = payload.temperature?.value;
    const ph = payload.ph?.value;
    const waterLevel = payload.water_level_pct?.value;
    const flowRate = payload.flow_rate_lpm?.value;
    const riskBand = payload.derived.risk_band;

    console.log(
      `[${now}] ` +
      `#${payload.sequence} ` +
      `Temp:${payload.temperature.status}:${Number.isFinite(temperature) ? temperature.toFixed(1) : 'null'}  ` +
      `pH:${payload.ph.status}:${Number.isFinite(ph) ? ph.toFixed(2) : 'null'}  ` +
      `Water:${payload.water_level_pct.status}:${Number.isFinite(waterLevel) ? waterLevel.toFixed(1) : 'null'}%  ` +
      `NH₃:${payload.ammonia_risk.status}:${payload.ammonia_risk.value}  ` +
      `Sec:${payload.security_status.status}:${payload.security_status.value}  ` +
      `Pipe:${payload.pipe_status.status}:${payload.pipe_status.value}  ` +
      `Pump:${payload.pump_status.status}:${payload.pump_status.value}  ` +
      `Flow:${payload.flow_rate_lpm.status}:${Number.isFinite(flowRate) ? flowRate.toFixed(1) : 'null'}L/min  ` +
      `O₂:${riskBand} ${payload.derived.estimated_range.low}-${payload.derived.estimated_range.high}`
    );

    sequence += 1;
    elapsedSeconds += INTERVAL_MS / 1000;
  };

  publish();
  setInterval(publish, INTERVAL_MS);
});

client.on('error', err => {
  console.error('\n❌ MQTT connection failed:', err.message);
  console.error('   Make sure Mosquitto is running: mosquitto -v\n');
  process.exit(1);
});

client.on('close', () => {
  console.log('\n🔌 Disconnected from MQTT broker.');
});
