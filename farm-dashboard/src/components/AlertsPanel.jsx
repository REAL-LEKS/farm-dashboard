import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert, CheckCircle, Filter } from 'lucide-react';

export default function AlertsPanel({ alerts, acknowledgeAlert }) {
  const [filter, setFilter] = useState('all');

  const filtered = alerts.filter(a => {
    if (filter === 'critical') return a.severity === 'critical';
    if (filter === 'warning') return a.severity === 'warning';
    if (filter === 'unread') return !a.acknowledged;
    return true;
  });

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-600">
        <CheckCircle size={48} className="mb-4 text-emerald-800/50" />
        <p className="text-lg font-semibold text-slate-500">No alerts yet</p>
        <p className="text-sm mt-1">All systems are operating normally.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-slate-500" />
        {['all', 'critical', 'warning', 'unread'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all capitalize
              ${filter === f
                ? 'bg-emerald-600 border-emerald-500 text-white'
                : 'bg-white border-slate-300 text-slate-500 hover:text-slate-900 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:text-white'}`}
          >
            {f} {f === 'all' ? `(${alerts.length})` : f === 'unread' ? `(${alerts.filter(a => !a.acknowledged).length})` : ''}
          </button>
        ))}
        <button
          onClick={() => alerts.forEach(a => acknowledgeAlert(a.id))}
          className="ml-auto px-3 py-1 rounded-full text-xs font-semibold border border-slate-300 text-slate-500 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:text-white hover:border-slate-500 transition-all"
        >
          Acknowledge All
        </button>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-center text-slate-600 py-8 text-sm">No alerts match this filter.</p>
        ) : (
          filtered.map(alert => (
            <AlertRow key={alert.id} alert={alert} onAck={() => acknowledgeAlert(alert.id)} />
          ))
        )}
      </div>
    </div>
  );
}

function AlertRow({ alert, onAck }) {
  const [expanded, setExpanded] = useState(false);
  const isCrit = alert.severity === 'critical';

  return (
    <div className={`rounded-xl border transition-all duration-200 overflow-hidden
      ${isCrit ? 'border-red-800/50 bg-red-900/10' : 'border-yellow-800/40 bg-yellow-900/10'}
      ${alert.acknowledged ? 'opacity-40' : ''}`}>
      <div
        className="flex items-center gap-3 p-4 cursor-pointer"
        onClick={() => setExpanded(p => !p)}
      >
        {isCrit
          ? <ShieldAlert size={18} className="text-red-400 shrink-0" />
          : <AlertTriangle size={18} className="text-yellow-400 shrink-0" />}

        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-sm ${isCrit ? 'text-red-700 dark:text-red-300' : 'text-yellow-700 dark:text-yellow-300'}`}>
            {alert.message}
          </p>
          <p className="text-slate-500 text-xs mt-0.5 font-mono">{alert.time}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border
            ${isCrit
              ? 'text-red-700 border-red-300 bg-red-100 dark:text-red-400 dark:border-red-700/50 dark:bg-red-900/30'
              : 'text-yellow-700 border-yellow-300 bg-yellow-100 dark:text-yellow-400 dark:border-yellow-700/50 dark:bg-yellow-900/30'}`}>
            {alert.severity}
          </span>
          {!alert.acknowledged && (
            <button
              onClick={e => { e.stopPropagation(); onAck(); }}
              className="text-[10px] font-bold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white border border-slate-300 dark:border-slate-700 hover:border-slate-500 rounded px-2 py-0.5 transition-all"
            >
              ACK
            </button>
          )}
        </div>
      </div>

      {expanded && alert.telemetry && (
        <div className="px-4 pb-4 border-t border-slate-200 dark:border-slate-800/50">
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mt-3 mb-2">Sensor Snapshot at Alert Time</p>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {[
              { label: 'Temp', val: alert.telemetry.temperature?.value ?? alert.telemetry.temperature, unit: '°C' },
              { label: 'pH', val: alert.telemetry.ph?.value ?? alert.telemetry.ph, unit: '' },
              { label: 'Water', val: alert.telemetry.water_level_pct?.value ?? alert.telemetry.water_level_pct, unit: '%' },
              { label: 'NH₃', val: alert.telemetry.ammonia_risk?.value ?? alert.telemetry.ammonia_risk, unit: '' },
              { label: 'Sec', val: alert.telemetry.security_status?.value ?? alert.telemetry.security_status, unit: '' },
              { label: 'Device', val: (alert.telemetry.device_connected?.value ?? alert.telemetry.device_connected) === false ? 'OFFLINE' : 'CONNECTED', unit: '' },
              { label: 'Pipe', val: alert.telemetry.pipe_status?.value ?? alert.telemetry.pipe_status, unit: '' },
              { label: 'Pump', val: alert.telemetry.pump_status?.value ?? alert.telemetry.pump_status, unit: '' },
              { label: 'Flow', val: alert.telemetry.flow_rate_lpm?.value ?? alert.telemetry.flow_rate_lpm, unit: 'L/min' },
              { label: 'Oxygen', val: alert.telemetry.derived?.risk_band ?? '—', unit: '' },
              { label: 'Range', val: alert.telemetry.derived?.estimated_range ? `${alert.telemetry.derived.estimated_range.low}-${alert.telemetry.derived.estimated_range.high}` : '—', unit: 'mg/L' },
            ].map(({ label, val, unit }) => (
              <div key={label} className="bg-slate-100 dark:bg-slate-900 rounded-lg p-2 text-center">
                <p className="text-slate-500 text-[10px]">{label}</p>
                <p className="text-slate-900 dark:text-white text-xs font-bold mt-0.5">{val ?? 'N/A'}{unit}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
