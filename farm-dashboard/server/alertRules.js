/**
 * alertRules.js
 * Server-side alert rules that run independently from the browser.
 */

function getChannel(telemetry = {}, field) {
  const value = telemetry?.[field];
  if (value && typeof value === 'object' && 'status' in value) {
    return value;
  }

  return {
    value,
    status: 'live',
  };
}

export function getChannelValue(telemetry, field) {
  return getChannel(telemetry, field)?.value;
}

export function getChannelStatus(telemetry, field) {
  return getChannel(telemetry, field)?.status || 'live';
}

export function getChannelAgeSeconds(telemetry, field) {
  const age = getChannel(telemetry, field)?.age_seconds;
  return Number.isFinite(age) ? age : null;
}

const RULES = [
  {
    id: 'temp_high',
    field: 'temperature',
    check: v => typeof v === 'number' && v > 32,
    severity: 'critical',
    msg: 'Water temperature critically HIGH (> 32°C)',
  },
  {
    id: 'temp_low',
    field: 'temperature',
    check: v => typeof v === 'number' && v < 24,
    severity: 'warning',
    msg: 'Water temperature too LOW (< 24°C)',
  },
  {
    id: 'ph_high',
    field: 'ph',
    check: v => typeof v === 'number' && v > 9.0,
    severity: 'critical',
    msg: 'pH level dangerously HIGH (> 9.0)',
  },
  {
    id: 'ph_low',
    field: 'ph',
    check: v => typeof v === 'number' && v < 6.0,
    severity: 'critical',
    msg: 'pH level dangerously LOW (< 6.0)',
  },
  {
    id: 'oxygen_risk_high',
    field: 'derived.risk_band',
    check: v => v === 'HIGH',
    severity: 'critical',
    msg: 'Oxygen risk band is high. Inspect the pond at dawn and check aeration before sunrise.',
  },
  {
    id: 'water_low',
    field: 'water_level_pct',
    check: v => typeof v === 'number' && v < 70,
    severity: 'warning',
    msg: 'Water level below operational threshold (< 70%)',
  },
  {
    id: 'ammonia_critical',
    field: 'ammonia_risk',
    check: v => v === 'CRITICAL',
    severity: 'critical',
    msg: 'Ammonia gas CRITICAL — ventilate the pond area immediately',
  },
  {
    id: 'motion',
    field: 'security_status',
    check: v => v === 'MOTION_DETECTED',
    severity: 'critical',
    msg: 'INTRUDER ALERT — motion detected at pond perimeter',
  },
  {
    id: 'device_disconnected',
    field: 'device_connected',
    check: v => v === false,
    severity: 'critical',
    msg: 'Device NOT CONNECTED — check controller power and network',
  },
  {
    id: 'pipe_broken',
    field: 'pipe_status',
    check: v => v === 'BROKEN',
    severity: 'critical',
    msg: 'Pipe BROKE — possible leak detected around pond line',
  },
  {
    id: 'pump_failure',
    field: 'pump_status',
    check: v => v === 'FAILED',
    severity: 'critical',
    msg: 'Water pump FAILED — circulation has stopped',
  },
  {
    id: 'flow_low',
    field: 'flow_rate_lpm',
    check: v => typeof v === 'number' && v < 20,
    severity: 'warning',
    msg: 'Water flow rate LOW (< 20 L/min) — inspect pipe, filter, or pump',
  },
];

export function normalizeTelemetry(telemetry = {}) {
  return {
    ...telemetry,
    temperature: getChannel(telemetry, 'temperature'),
    ph: getChannel(telemetry, 'ph'),
    water_level_pct: getChannel(telemetry, 'water_level_pct'),
    ammonia_risk: getChannel(telemetry, 'ammonia_risk'),
    security_status: getChannel(telemetry, 'security_status'),
    device_connected: getChannel(telemetry, 'device_connected'),
    pipe_status: getChannel(telemetry, 'pipe_status'),
    pump_status: getChannel(telemetry, 'pump_status'),
    flow_rate_lpm: getChannel(telemetry, 'flow_rate_lpm'),
    controller_battery_pct: getChannel(telemetry, 'controller_battery_pct'),
    derived: telemetry.derived || {},
  };
}

export function checkAlertRules(telemetry) {
  const normalizedTelemetry = normalizeTelemetry(telemetry);

  return RULES.filter(rule => {
    const [rootField, nestedField] = rule.field.split('.');
    const channel = nestedField ? normalizedTelemetry[rootField] : normalizedTelemetry[rule.field];
    const status = nestedField ? null : getChannelStatus(normalizedTelemetry, rule.field);
    const val = nestedField ? normalizedTelemetry[rootField]?.[nestedField] : channel?.value;

    if (!nestedField && status !== 'live') return false;
    if (val === undefined || val === null) return false;
    return rule.check(val);
  });
}

export function isNodeSilent(lastPayloadAt, thresholdMs = 30000, now = Date.now()) {
  return !lastPayloadAt || now - lastPayloadAt >= thresholdMs;
}
