import React, { useState, useEffect, useRef, useCallback } from 'react';
import mqtt from 'mqtt';
import MetricCard from './components/MetricCard';
import ChartsSection from './components/ChartsSection';
import AlertsPanel from './components/AlertsPanel';
import NotifySettings from './components/NotifySettings';
import {
  Thermometer, Droplets, Wind, Waves, ShieldCheck, ShieldAlert,
  Wifi, WifiOff, Bell, BellOff, Settings, Fish,
  LayoutDashboard, ChevronRight, Send, Activity
} from 'lucide-react';

const COOLDOWN_MS = 10 * 60 * 1000;
const NODE_SILENCE_MS = 30 * 1000;

// Browsers require WebSocket MQTT; wss:// is mandatory when the page is served
// over HTTPS (e.g. the Render deployment). EMQX's public broker is free and
// needs no account — override with VITE_MQTT_URL for a private broker.
const DEFAULT_MQTT_URL = import.meta.env.VITE_MQTT_URL || 'wss://broker.emqx.io:8084/mqtt';
const LEGACY_MQTT_URL = 'ws://localhost:9001';
const MQTT_TOPIC_BASE = import.meta.env.VITE_MQTT_TOPIC_BASE || 'leksfarm/pond1';
const MQTT_DATA_TOPIC = `${MQTT_TOPIC_BASE}/data`;
const MQTT_ALERTS_TOPIC = `${MQTT_TOPIC_BASE}/alerts`;

const DEFAULT_CHANNEL = (value, status = 'live', age_seconds = null) => ({ value, status, age_seconds });

const EMPTY_TELEMETRY = {
  sequence: 0,
  uptime_seconds: 0,
  temperature: DEFAULT_CHANNEL(null, 'stale'),
  ph: DEFAULT_CHANNEL(null, 'stale'),
  water_level_pct: DEFAULT_CHANNEL(null, 'stale'),
  ammonia_risk: DEFAULT_CHANNEL(null, 'stale'),
  security_status: DEFAULT_CHANNEL(null, 'stale'),
  device_connected: DEFAULT_CHANNEL(false, 'stale'),
  pipe_status: DEFAULT_CHANNEL(null, 'stale'),
  pump_status: DEFAULT_CHANNEL(null, 'stale'),
  flow_rate_lpm: DEFAULT_CHANNEL(null, 'stale'),
  controller_battery_pct: DEFAULT_CHANNEL(null, 'stale'),
  derived: {
    saturation_ceiling: null,
    estimated_range: { low: null, high: null },
    risk_band: null,
    ph_amplitude: null,
    model_unvalidated: true,
  },
};

const DEFAULT_SETTINGS = {
  phone: '', email: '', whatsapp: '',
  smsEnabled: true, emailEnabled: true, whatsappEnabled: true,
  serverUrl: import.meta.env.VITE_SERVER_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001'),
  mqttUrl: DEFAULT_MQTT_URL,
};

const ALERT_RULES = [
  { id: 'temp_high', field: 'temperature', check: v => typeof v === 'number' && v > 32, severity: 'critical', msg: 'Water temperature critically HIGH' },
  { id: 'temp_low', field: 'temperature', check: v => typeof v === 'number' && v < 24, severity: 'warning', msg: 'Water temperature too LOW' },
  { id: 'ph_high', field: 'ph', check: v => typeof v === 'number' && v > 9.0, severity: 'critical', msg: 'pH level dangerously HIGH' },
  { id: 'ph_low', field: 'ph', check: v => typeof v === 'number' && v < 6.0, severity: 'critical', msg: 'pH level dangerously LOW' },
  { id: 'oxygen_high_risk', field: 'derived.risk_band', check: v => v === 'HIGH', severity: 'critical', msg: 'Oxygen risk band is high. Inspect the pond at dawn and check aeration before sunrise.' },
  { id: 'water_low', field: 'water_level_pct', check: v => typeof v === 'number' && v < 70, severity: 'warning', msg: 'Water level below operational threshold' },
  { id: 'ammonia', field: 'ammonia_risk', check: v => v === 'CRITICAL', severity: 'critical', msg: 'Ammonia gas CRITICAL — ventilate immediately' },
  { id: 'motion', field: 'security_status', check: v => v === 'MOTION_DETECTED', severity: 'critical', msg: 'INTRUDER ALERT — motion detected at pond' },
  { id: 'device_disconnected', field: 'device_connected', check: v => v === false, severity: 'critical', msg: 'Device NOT CONNECTED — check controller power and network' },
  { id: 'pipe_broken', field: 'pipe_status', check: v => v === 'BROKEN', severity: 'critical', msg: 'Pipe BROKE — possible leak detected' },
  { id: 'pump_failure', field: 'pump_status', check: v => v === 'FAILED', severity: 'critical', msg: 'Water pump FAILED — circulation stopped' },
  { id: 'flow_low', field: 'flow_rate_lpm', check: v => typeof v === 'number' && v < 20, severity: 'warning', msg: 'Water flow is too LOW — inspect pipe, filter, or pump' },
];

function isChannelObject(value) {
  return Boolean(value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'status'));
}

function normalizeChannel(value, fallback = null) {
  if (isChannelObject(value)) {
    return {
      value: Object.prototype.hasOwnProperty.call(value, 'value') ? value.value : fallback,
      status: value.status || 'live',
      age_seconds: Number.isFinite(value.age_seconds) ? value.age_seconds : null,
    };
  }

  return {
    value: value ?? fallback,
    status: 'live',
    age_seconds: null,
  };
}

function normalizeTelemetry(payload = {}) {
  return {
    sequence: payload.sequence ?? 0,
    uptime_seconds: payload.uptime_seconds ?? 0,
    temperature: normalizeChannel(payload.temperature, 0),
    ph: normalizeChannel(payload.ph, 0),
    water_level_pct: normalizeChannel(payload.water_level_pct, 0),
    ammonia_risk: normalizeChannel(payload.ammonia_risk, 'SAFE'),
    security_status: normalizeChannel(payload.security_status, 'CLEAR'),
    device_connected: normalizeChannel(payload.device_connected, true),
    pipe_status: normalizeChannel(payload.pipe_status, 'OK'),
    pump_status: normalizeChannel(payload.pump_status, 'RUNNING'),
    flow_rate_lpm: normalizeChannel(payload.flow_rate_lpm, 0),
    controller_battery_pct: normalizeChannel(payload.controller_battery_pct, 100),
    derived: payload.derived || EMPTY_TELEMETRY.derived,
  };
}

function getChannelValue(telemetry, field) {
  return telemetry?.[field]?.value;
}

function getChannelStatus(telemetry, field) {
  return telemetry?.[field]?.status || 'live';
}

function getChannelAge(telemetry, field) {
  const age = telemetry?.[field]?.age_seconds;
  return Number.isFinite(age) ? age : null;
}

function readRuleValue(telemetry, field) {
  if (field === 'derived.risk_band') return telemetry?.derived?.risk_band;
  return getChannelValue(telemetry, field);
}

function getPriorityAction(telemetry, isNodeStale, hasReceivedPayload, connectionStatus) {
  if (!hasReceivedPayload) {
    if (connectionStatus === 'error' || connectionStatus === 'offline') {
      return {
        severity: 'critical',
        title: 'Broker unreachable',
        message: 'Cannot connect to the MQTT broker. Check the MQTT Broker URL on the Settings page and your internet connection.',
      };
    }
    if (connectionStatus === 'connecting') {
      return {
        severity: 'waiting',
        title: 'Connecting to broker',
        message: 'Opening the MQTT connection — this normally takes a few seconds.',
      };
    }
    return {
      severity: 'waiting',
      title: 'Waiting for data',
      message: `Broker link is up but no sensor payload has arrived yet. Make sure the simulator or sensor node is publishing to ${MQTT_DATA_TOPIC} on the same broker.`,
    };
  }

  if (isNodeStale) {
    return {
      severity: 'critical',
      title: 'Node silence',
      message: 'No payload has arrived for 30 seconds. Check the node power, broker link, and sensor gateway now.',
    };
  }

  if (getChannelStatus(telemetry, 'security_status') === 'live' && getChannelValue(telemetry, 'security_status') === 'MOTION_DETECTED') {
    return {
      severity: 'critical',
      title: 'Perimeter motion',
      message: 'Go to the pond perimeter and check the camera and gate before anything else.',
    };
  }

  if (getChannelStatus(telemetry, 'device_connected') === 'live' && getChannelValue(telemetry, 'device_connected') === false) {
    return {
      severity: 'critical',
      title: 'Controller offline',
      message: 'Confirm controller power, cable seating, and network link.',
    };
  }

  if (telemetry?.derived?.risk_band === 'HIGH') {
    return {
      severity: 'critical',
      title: 'Oxygen risk',
      message: 'Inspect the pond at dawn and prepare aeration before sunrise.',
    };
  }

  if (getChannelStatus(telemetry, 'ammonia_risk') === 'live' && getChannelValue(telemetry, 'ammonia_risk') === 'CRITICAL') {
    return {
      severity: 'critical',
      title: 'Ammonia spike',
      message: 'Ventilate the pond area immediately and check feeding input.',
    };
  }

  return {
    severity: 'normal',
    title: 'System steady',
    message: 'Measured channels are live and the pond looks stable right now.',
  };
}

function formatUptime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0m';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function loadStoredSettings() {
  try {
    const stored = localStorage.getItem('farm_settings');
    if (!stored) return DEFAULT_SETTINGS;
    const merged = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    // Migrate settings saved before the online broker existed: anyone still on
    // the old localhost default gets moved to the online broker automatically.
    if (merged.mqttUrl === LEGACY_MQTT_URL) merged.mqttUrl = DEFAULT_MQTT_URL;
    // Same for the backend URL: a localhost value saved during local testing is
    // unreachable once the dashboard is opened from a deployed domain.
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    if (origin && !origin.includes('localhost') && !origin.includes('127.0.0.1') && merged.serverUrl?.includes('localhost')) {
      merged.serverUrl = DEFAULT_SETTINGS.serverUrl;
    }
    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessageAt, setLastMessageAt] = useState(0);
  const [lastUpdated, setLastUpdated] = useState('--:--:--');
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [sendingReport, setSendingReport] = useState(false);
  const [reportResult, setReportResult] = useState(null);
  const [isNodeStale, setIsNodeStale] = useState(false);
  const [hasReceivedPayload, setHasReceivedPayload] = useState(false);
  const [telemetry, setTelemetry] = useState(EMPTY_TELEMETRY);
  const [chartData, setChartData] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [settings, setSettings] = useState(loadStoredSettings);
  const [mqttConnUrl, setMqttConnUrl] = useState(() => loadStoredSettings().mqttUrl);
  const [connectionStatus, setConnectionStatus] = useState('waiting');
  const hasLiveTelemetry = hasReceivedPayload && !isNodeStale;

  const mqttClient = useRef(null);
  const cooldowns = useRef({});
  const nodeSilenceAlerted = useRef(false);

  const fireAlert = useCallback((rule, telemetrySnapshot) => {
    const now = Date.now();
    const lastFired = cooldowns.current[rule.id] || 0;
    if (now - lastFired < COOLDOWN_MS) return;
    cooldowns.current[rule.id] = now;

    const newAlert = {
      id: `${rule.id}-${now}`,
      severity: rule.severity,
      message: rule.msg,
      time: new Date().toLocaleTimeString(),
      acknowledged: false,
      telemetry: JSON.parse(JSON.stringify(telemetrySnapshot)),
    };

    setAlerts(prev => [newAlert, ...prev].slice(0, 50));
    setUnreadCount(prev => prev + 1);

    if (notifyEnabled && settings.serverUrl) {
      fetch(`${settings.serverUrl}/api/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert: newAlert,
          contacts: {
            phone: settings.smsEnabled ? settings.phone : null,
            email: settings.emailEnabled ? settings.email : null,
            whatsapp: settings.whatsappEnabled ? settings.whatsapp : null,
          },
        }),
      }).catch(() => {});
    }
  }, [notifyEnabled, settings]);

  const buildTelemetrySnapshot = useCallback((payload) => normalizeTelemetry(payload), []);

  useEffect(() => {
    if (!mqttConnUrl) {
      setIsConnected(false);
      return undefined;
    }

    let client;
    let connectionTimer;
    try {
      client = mqtt.connect(mqttConnUrl, {
        reconnectPeriod: 3000,
        connectTimeout: 5000,
      });
    } catch {
      setIsConnected(false);
      return undefined;
    }

    mqttClient.current = client;
    setIsConnected(false);
    setConnectionStatus('connecting');

    client.on('connect', () => {
      client.subscribe(MQTT_DATA_TOPIC, err => {
        if (!err) {
          client.subscribe(MQTT_ALERTS_TOPIC, err2 => {
            if (!err2) {
              setIsConnected(true);
              setConnectionStatus('connected');
            } else {
              setIsConnected(false);
              setConnectionStatus('error');
            }
          });
        } else {
          setIsConnected(false);
          setConnectionStatus('error');
        }
      });
    });

    client.on('message', (topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        const now = Date.now();
        const snapshot = buildTelemetrySnapshot(payload);

        setLastMessageAt(now);
        setHasReceivedPayload(true);
        setConnectionStatus('receiving');
        setLastUpdated(new Date(now).toLocaleTimeString());
        setIsNodeStale(false);
        nodeSilenceAlerted.current = false;

        if (topic === MQTT_DATA_TOPIC) {
          setTelemetry(snapshot);

          const derived = snapshot.derived || EMPTY_TELEMETRY.derived;
          const oxygenRange = derived.estimated_range || EMPTY_TELEMETRY.derived.estimated_range;

          setChartData(prev => [...prev, {
            time: new Date(now).toLocaleTimeString(),
            temp: Number.isFinite(getChannelValue(snapshot, 'temperature')) ? getChannelValue(snapshot, 'temperature') : null,
            ph: Number.isFinite(getChannelValue(snapshot, 'ph')) ? getChannelValue(snapshot, 'ph') : null,
            water: Number.isFinite(getChannelValue(snapshot, 'water_level_pct')) ? getChannelValue(snapshot, 'water_level_pct') : null,
            oxygenLow: Number.isFinite(oxygenRange?.low) ? oxygenRange.low : null,
            oxygenHigh: Number.isFinite(oxygenRange?.high) ? oxygenRange.high : null,
          }].slice(-30));

          ALERT_RULES.forEach(rule => {
            const value = readRuleValue(snapshot, rule.field);
            if (rule.field !== 'derived.risk_band' && getChannelStatus(snapshot, rule.field) !== 'live') return;
            if (value === undefined || value === null) return;
            if (rule.check(value)) fireAlert(rule, snapshot);
          });
        } else if (topic === MQTT_ALERTS_TOPIC) {
          setTelemetry(prev => ({
            ...prev,
            security_status: DEFAULT_CHANNEL(payload.status || 'CLEAR'),
          }));
        }
      } catch (error) {
        console.error('Parse error:', error);
      }
    });

    client.on('reconnect', () => setIsConnected(false));
    client.on('offline', () => {
      setIsConnected(false);
      setConnectionStatus('offline');
    });
    client.on('close', () => {
      setIsConnected(false);
      setConnectionStatus('offline');
    });
    client.on('error', () => {
      setIsConnected(false);
      setConnectionStatus('error');
    });

    connectionTimer = window.setTimeout(() => {
      if (!client.connected && !client.reconnecting) {
        setIsConnected(false);
        setConnectionStatus('offline');
      }
    }, 6000);

    return () => {
      if (connectionTimer) window.clearTimeout(connectionTimer);
      client.end(true);
    };
  }, [mqttConnUrl, buildTelemetrySnapshot, fireAlert]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const stale = lastMessageAt > 0 && (now - lastMessageAt > NODE_SILENCE_MS);
      // Only mark stale after we've seen at least one payload; prevents initial dimming
      const shouldBeStale = hasReceivedPayload && stale;
      setIsNodeStale(shouldBeStale);

      if (shouldBeStale && !nodeSilenceAlerted.current) {
        nodeSilenceAlerted.current = true;
        fireAlert(
          {
            id: 'node_silence',
            severity: 'critical',
            msg: 'No payload has arrived for 30 seconds. Check the node power, broker link, and sensor gateway now.',
            field: 'derived.risk_band',
            check: () => true,
          },
          telemetry,
        );
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [lastMessageAt, telemetry, fireAlert]);

  const acknowledgeAlert = (id) => {
    setAlerts(prev => prev.map(alert => (alert.id === id ? { ...alert, acknowledged: true } : alert)));
  };

  const sendManualReport = async () => {
    if (!settings.serverUrl || sendingReport) return;
    setSendingReport(true);
    setReportResult(null);
    try {
      const response = await fetch(`${settings.serverUrl}/api/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telemetry,
          contacts: {
            phone: settings.smsEnabled ? settings.phone : null,
            email: settings.emailEnabled ? settings.email : null,
            whatsapp: settings.whatsappEnabled ? settings.whatsapp : null,
          },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) {
        setReportResult({ error: payload?.error || `Server rejected the report (HTTP ${response.status})` });
      } else {
        setReportResult({ results: payload.results || [], time: new Date().toLocaleTimeString() });
      }
    } catch {
      setReportResult({ error: 'Cannot reach backend server — check the Notification Server URL in Settings' });
    }
    setSendingReport(false);
  };

  const saveNotifySettings = async (nextSettings) => {
    if (!nextSettings?.serverUrl) return { ok: false, error: 'Server URL is required' };

    try {
      const response = await fetch(`${nextSettings.serverUrl}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: {
            phone: nextSettings.smsEnabled ? nextSettings.phone : null,
            email: nextSettings.emailEnabled ? nextSettings.email : null,
            whatsapp: nextSettings.whatsappEnabled ? nextSettings.whatsapp : null,
          },
          channels: {
            smsEnabled: nextSettings.smsEnabled,
            emailEnabled: nextSettings.emailEnabled,
            whatsappEnabled: nextSettings.whatsappEnabled,
          },
          mqttUrl: nextSettings.mqttUrl,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        return { ok: false, error: payload.error || 'Failed to save settings' };
      }

      localStorage.setItem('farm_settings', JSON.stringify(nextSettings));
      if (nextSettings.mqttUrl && nextSettings.mqttUrl !== mqttConnUrl) {
        setMqttConnUrl(nextSettings.mqttUrl);
      }

      return { ok: true };
    } catch {
      return { ok: false, error: 'Cannot reach backend server' };
    }
  };

  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'alerts', icon: Bell, label: 'Alerts', badge: unreadCount },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  const activeAction = getPriorityAction(telemetry, isNodeStale, hasReceivedPayload, connectionStatus);

  return (
    <div className={`min-h-screen bg-[#0a0f1a] text-slate-200 font-sans flex ${isNodeStale ? 'opacity-70 saturate-50' : ''}`}>
      <aside className="w-20 md:w-64 bg-[#0d1526] border-r border-slate-800/60 flex flex-col py-6 px-3 md:px-5 shrink-0">
        <div className="flex items-center gap-3 mb-10 px-1">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
            <Fish className="text-emerald-400" size={20} />
          </div>
          <div className="hidden md:block">
            <p className="text-white font-bold text-sm leading-tight">Leks' Farm</p>
            <p className="text-slate-500 text-xs">Pond 1 Monitor</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map(({ id, icon: Icon, label, badge }) => (
            <button
              key={id}
              onClick={() => {
                setPage(id);
                if (id === 'alerts') setUnreadCount(0);
              }}
              className={`relative flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group
                ${page === id
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/50'}`}
            >
              <Icon size={20} className="shrink-0" />
              <span className="hidden md:block text-sm font-medium">{label}</span>
              {badge > 0 && (
                <span className="absolute top-2 right-2 md:static md:ml-auto bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
              {page === id && <ChevronRight size={14} className="hidden md:block ml-auto text-emerald-400/60" />}
            </button>
          ))}
        </nav>

        <div className={`flex items-center gap-2 px-3 py-3 rounded-xl border text-xs font-bold
          ${hasLiveTelemetry ? 'bg-emerald-900/20 border-emerald-800/50 text-emerald-400' : 'bg-red-900/20 border-red-800/50 text-red-400'}`}>
          {hasLiveTelemetry
            ? <><Wifi size={14} className="animate-pulse shrink-0" /><span className="hidden md:block">CONNECTED</span></>
            : <><WifiOff size={14} className="shrink-0" /><span className="hidden md:block">Disconnected</span></>}
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <header className="sticky top-0 z-10 bg-[#0a0f1a]/80 backdrop-blur border-b border-slate-800/60 px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              {page === 'dashboard' && 'Live Dashboard'}
              {page === 'alerts' && 'Alert Log'}
              {page === 'settings' && 'Notification Settings'}
            </h1>
            <p className="text-slate-500 text-xs mt-0.5">Last payload: <span className="font-mono text-slate-400">{lastUpdated}</span></p>
            <p className="text-[11px] mt-1 text-slate-500">Status: <span className="font-mono text-slate-400">{connectionStatus === 'receiving' ? 'receiving data' : connectionStatus === 'connected' ? 'broker connected' : connectionStatus === 'connecting' ? 'connecting' : connectionStatus === 'error' ? 'connection error' : 'waiting for data'}</span></p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setNotifyEnabled(prev => !prev)}
              title={notifyEnabled ? 'Notifications ON' : 'Notifications OFF'}
              className={`p-2 rounded-lg border transition-all ${notifyEnabled ? 'bg-emerald-900/20 border-emerald-700/50 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
            >
              {notifyEnabled ? <Bell size={18} /> : <BellOff size={18} />}
            </button>
            <button
              onClick={sendManualReport}
              disabled={sendingReport}
              className={`flex items-center gap-2 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-all active:scale-95
                ${sendingReport ? 'bg-emerald-800 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500'}`}
            >
              <Send size={15} />
              <span className="hidden md:block">{sendingReport ? 'Sending…' : 'Send Report'}</span>
            </button>
          </div>
        </header>

        <div className="p-6">
          {reportResult && <ReportResultBanner result={reportResult} onDismiss={() => setReportResult(null)} />}
          {page === 'dashboard' && (
            <DashboardPage
              telemetry={telemetry}
              chartData={chartData}
              alerts={alerts}
              acknowledgeAlert={acknowledgeAlert}
              isConnected={isConnected}
              isNodeStale={isNodeStale}
              hasLiveTelemetry={hasLiveTelemetry}
              activeAction={activeAction}
              lastMessageAt={lastMessageAt}
            />
          )}
          {page === 'alerts' && (
            <AlertsPanel alerts={alerts} acknowledgeAlert={acknowledgeAlert} />
          )}
          {page === 'settings' && (
            <NotifySettings settings={settings} setSettings={setSettings} onSave={saveNotifySettings} />
          )}
        </div>
      </main>
    </div>
  );
}

function DashboardPage({ telemetry, chartData, alerts, acknowledgeAlert, isConnected, isNodeStale, hasLiveTelemetry, activeAction, lastMessageAt }) {
  const measuredCards = [
    { key: 'temperature', title: 'Temperature', unit: '°C', color: 'orange', icon: Thermometer, optimal: '26–30°C' },
    { key: 'ph', title: 'pH Level', unit: '', color: 'violet', icon: Droplets, optimal: '6.5–8.5' },
    { key: 'water_level_pct', title: 'Water Volume', unit: '%', color: 'blue', icon: Waves, optimal: '> 80%' },
    { key: 'ammonia_risk', title: 'Ammonia Gas', unit: '', color: 'yellow', icon: Wind, optimal: 'SAFE' },
    { key: 'device_connected', title: 'Device Link', unit: '', color: 'emerald', icon: Wifi, optimal: 'CONNECTED' },
    { key: 'pipe_status', title: 'Pipe Status', unit: '', color: 'blue', icon: Waves, optimal: 'OK' },
    { key: 'pump_status', title: 'Pump Status', unit: '', color: 'sky', icon: Activity, optimal: 'RUNNING' },
    { key: 'flow_rate_lpm', title: 'Flow Rate', unit: 'L/min', color: 'sky', icon: Droplets, optimal: '> 20 L/min' },
    { key: 'controller_battery_pct', title: 'Controller Battery', unit: '%', color: 'emerald', icon: Activity, optimal: '> 25%' },
    { key: 'security_status', title: 'Security', unit: '', color: 'orange', icon: ShieldCheck, optimal: 'CLEAR' },
  ];

  return (
    <div className="space-y-6">
      <PriorityActionCard action={activeAction} isNodeStale={isNodeStale} />

      {isNodeStale && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 flex items-center gap-3 animate-pulse">
          <WifiOff className="text-red-400 shrink-0" size={22} />
          <div>
            <p className="text-red-400 font-bold text-sm">NODE SILENCE</p>
            <p className="text-red-300/70 text-xs">No MQTT payload has arrived for 30 seconds. The board is dimmed until data resumes.</p>
          </div>
        </div>
      )}

      {getChannelStatus(telemetry, 'security_status') === 'live' && getChannelValue(telemetry, 'security_status') === 'MOTION_DETECTED' && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 flex items-center gap-3 animate-pulse">
          <ShieldAlert className="text-red-400 shrink-0" size={22} />
          <div>
            <p className="text-red-400 font-bold text-sm">INTRUDER ALERT</p>
            <p className="text-red-300/70 text-xs">Motion detected at pond — check the perimeter camera and gate.</p>
          </div>
        </div>
      )}

      {getChannelStatus(telemetry, 'device_connected') === 'live' && getChannelValue(telemetry, 'device_connected') === false && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 flex items-center gap-3 animate-pulse">
          <WifiOff className="text-red-400 shrink-0" size={22} />
          <div>
            <p className="text-red-400 font-bold text-sm">DEVICE OFFLINE</p>
            <p className="text-red-300/70 text-xs">Controller is not connected. Check power, cable, and network.</p>
          </div>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-white font-bold text-sm">Measured</h2>
            <p className="text-slate-500 text-xs">Live channels, cached fallbacks, stale reads, and failed gates.</p>
          </div>
          <p className="text-slate-500 text-xs font-mono">Seq {telemetry.sequence} · Uptime {formatUptime(telemetry.uptime_seconds)}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {measuredCards.map(card => {
            const channel = telemetry[card.key];
            const status = card.key === 'device_connected' ? (hasLiveTelemetry ? 'live' : 'stale') : (channel?.status || 'live');
            const age = getChannelAge(telemetry, card.key);
            const displayValue = card.key === 'device_connected'
              ? (hasLiveTelemetry ? 'CONNECTED' : 'OFFLINE')
              : card.key === 'security_status'
              ? (channel?.value === 'MOTION_DETECTED' ? 'MOTION' : 'CLEAR')
              : channel?.value;

            return (
              <MetricCard
                key={card.key}
                title={card.title}
                value={displayValue}
                unit={card.unit}
                color={card.color}
                icon={card.icon}
                optimal={card.optimal}
                status={status}
                age={age}
              />
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-white font-bold text-sm">Derived</h2>
          <p className="text-slate-500 text-xs">Estimated oxygen output and trend signals from the local model.</p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          <DerivedOxygenCard derived={telemetry.derived} />
          <DerivedStatCard label="Saturation ceiling" value={`${telemetry.derived?.saturation_ceiling ?? '—'} mg/L`} accent="sky" />
          <DerivedStatCard label="pH amplitude" value={`${telemetry.derived?.ph_amplitude ?? '—'} pH units`} accent="violet" />
          <DerivedStatCard label="Model validation" value={telemetry.derived?.model_unvalidated ? 'Unvalidated' : 'Validated'} accent="yellow" note="This model is for field guidance only." />
        </div>

        <p className="text-slate-500 text-[11px] leading-relaxed">
          Caveat: the oxygen estimate is an operational guide, not a calibrated lab measurement. Use the range and ceiling to decide whether to inspect at dawn.
        </p>
      </section>

      <ChartsSection chartData={chartData} />

      {alerts.length > 0 && (
        <div className="bg-[#0d1526] border border-slate-800 rounded-xl p-5">
          <h3 className="text-white font-bold text-sm mb-4 flex items-center gap-2">
            <Bell size={16} className="text-yellow-400" /> Recent Alerts
          </h3>
          <div className="space-y-2">
            {alerts.slice(0, 5).map(alert => (
              <div key={alert.id} className={`flex items-center justify-between p-3 rounded-lg border text-sm
                ${alert.severity === 'critical' ? 'bg-red-900/10 border-red-800/40' : 'bg-yellow-900/10 border-yellow-800/40'}
                ${alert.acknowledged ? 'opacity-40' : ''}`}>
                <div>
                  <span className={`font-semibold ${alert.severity === 'critical' ? 'text-red-400' : 'text-yellow-400'}`}>{alert.message}</span>
                  <span className="text-slate-500 text-xs ml-2">{alert.time}</span>
                </div>
                {!alert.acknowledged && (
                  <button onClick={() => acknowledgeAlert(alert.id)} className="text-xs text-slate-400 hover:text-white border border-slate-700 rounded px-2 py-1 shrink-0">ACK</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReportResultBanner({ result, onDismiss }) {
  const statusStyle = {
    sent: 'text-emerald-400',
    failed: 'text-red-400',
    skipped: 'text-slate-500',
  };
  const statusIcon = { sent: '✅', failed: '❌', skipped: '⏭️' };
  const anySent = result.results?.some(r => r.status === 'sent');
  const anyFailed = result.results?.some(r => r.status === 'failed');

  return (
    <div className={`mb-6 rounded-xl border p-4 ${result.error || (anyFailed && !anySent)
      ? 'bg-red-900/10 border-red-800/40'
      : anyFailed
      ? 'bg-yellow-900/10 border-yellow-800/40'
      : 'bg-emerald-900/10 border-emerald-800/40'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white font-bold text-sm">
            {result.error ? 'Report could not be sent' : `Report delivery${result.time ? ` · ${result.time}` : ''}`}
          </p>
          {result.error ? (
            <p className="text-red-400 text-xs mt-1">{result.error}</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {result.results.map(r => (
                <li key={r.channel} className="text-xs flex gap-2">
                  <span>{statusIcon[r.status] || '•'}</span>
                  <span className="text-slate-300 font-semibold w-16 shrink-0">{r.channel}</span>
                  <span className={statusStyle[r.status] || 'text-slate-400'}>
                    {r.status === 'sent' ? r.detail || 'Sent' : r.status === 'skipped' ? r.detail || 'Skipped' : r.detail || 'Failed'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button onClick={onDismiss} className="text-slate-500 hover:text-white text-xs border border-slate-700 rounded px-2 py-1 shrink-0">
          Dismiss
        </button>
      </div>
    </div>
  );
}

function PriorityActionCard({ action, isNodeStale }) {
  const tone = action.severity === 'critical'
    ? 'from-red-500/20 to-red-500/5 border-red-500/30 text-red-100'
    : action.severity === 'waiting'
    ? 'from-yellow-500/20 to-yellow-500/5 border-yellow-500/30 text-yellow-100'
    : 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 text-emerald-100';

  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${tone} p-5 shadow-lg`}>
      <div className="flex items-start gap-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${action.severity === 'critical' ? 'bg-red-500/15' : action.severity === 'waiting' ? 'bg-yellow-500/15' : 'bg-emerald-500/15'}`}>
          {action.severity === 'critical'
            ? <ShieldAlert className="text-red-300" size={20} />
            : action.severity === 'waiting'
            ? <Wifi className="text-yellow-300 animate-pulse" size={20} />
            : <Activity className="text-emerald-300" size={20} />}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{isNodeStale ? 'Highest active condition' : 'Current priority'}</p>
          <h3 className="text-lg font-bold text-white mt-1">{action.title}</h3>
          <p className="text-sm text-slate-200/90 mt-1">{action.message}</p>
        </div>
      </div>
    </div>
  );
}

function DerivedOxygenCard({ derived }) {
  const range = derived?.estimated_range || { low: '—', high: '—' };

  return (
    <div className="xl:col-span-2 rounded-2xl border border-slate-800 bg-[#0d1526] p-5 shadow-lg">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-slate-500 text-xs uppercase tracking-[0.18em]">Oxygen output</p>
          <h4 className="text-white font-bold text-sm mt-1">Estimated range</h4>
        </div>
        <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
          <Activity className="text-sky-300" size={18} />
        </div>
      </div>

      <div className="flex items-end gap-2">
        <span className="text-4xl font-black tracking-tight text-white">{range.low}</span>
        <span className="text-3xl font-semibold text-sky-300">- {range.high}</span>
        <span className="text-sm text-slate-500 mb-1">mg/L</span>
      </div>

      <div className="mt-4 border-t border-slate-800 pt-3 space-y-2">
        <p className="text-slate-400 text-xs">Ceiling</p>
        <p className="text-sky-300 text-sm font-semibold">{derived?.saturation_ceiling ?? '—'} mg/L</p>
        <p className="text-slate-500 text-[11px]">Risk band: {derived?.risk_band ?? '—'}</p>
      </div>
    </div>
  );
}

function DerivedStatCard({ label, value, accent, note }) {
  const colorMap = {
    sky: 'text-sky-300 border-sky-500/20 bg-sky-500/10',
    violet: 'text-violet-300 border-violet-500/20 bg-violet-500/10',
    yellow: 'text-yellow-300 border-yellow-500/20 bg-yellow-500/10',
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0d1526] p-5 shadow-lg">
      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${colorMap[accent] || colorMap.sky}`}>
        <Activity size={18} />
      </div>
      <p className="text-slate-500 text-xs mt-4">{label}</p>
      <p className="text-white font-bold text-base mt-1">{value}</p>
      {note && <p className="text-slate-500 text-[11px] mt-2">{note}</p>}
    </div>
  );
}
