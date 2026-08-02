import React from 'react';
import { Wifi, WifiOff } from 'lucide-react';

const COLOR_MAP = {
  orange: { text: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-500/20', glow: 'shadow-orange-500/10' },
  violet: { text: 'text-violet-400', bg: 'bg-violet-400/10', border: 'border-violet-500/20', glow: 'shadow-violet-500/10' },
  sky:    { text: 'text-sky-400',    bg: 'bg-sky-400/10',    border: 'border-sky-500/20',    glow: 'shadow-sky-500/10'    },
  blue:   { text: 'text-blue-400',   bg: 'bg-blue-400/10',   border: 'border-blue-500/20',   glow: 'shadow-blue-500/10'   },
  yellow: { text: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-500/20', glow: 'shadow-yellow-500/10' },
  emerald:{ text: 'text-emerald-400',bg: 'bg-emerald-400/10',border: 'border-emerald-500/20',glow: 'shadow-emerald-500/10'},
};

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? `${value}` : `${value.toFixed(1)}`;
  }
  return `${value}`;
}

export default function MetricCard({ title, value, unit, color = 'emerald', icon: Icon, optimal, status = 'live', age }) {
  const c = COLOR_MAP[color] || COLOR_MAP.emerald;

  const visualState = status === 'failed'
    ? 'failed'
    : status === 'stale'
    ? 'stale'
    : status === 'substituted'
    ? 'substituted'
    : 'live';

  const cardClass = visualState === 'failed'
    ? 'bg-red-100/60 border-red-300 dark:bg-red-950/20 dark:border-red-900/50 shadow-lg dark:shadow-red-900/20'
    : visualState === 'stale'
    ? 'bg-slate-200/60 border-slate-300 dark:bg-slate-900/40 dark:border-slate-800/60'
    : visualState === 'substituted'
    ? 'bg-slate-200/80 border-slate-300 dark:bg-slate-900/55 dark:border-slate-700/60 shadow-lg dark:shadow-slate-950/20'
    : `bg-white border-slate-200 dark:bg-[#0d1526] dark:border-slate-800 shadow-lg ${c.glow}`;

  const valueClass = visualState === 'failed'
    ? 'text-red-600 dark:text-red-400'
    : visualState === 'stale'
    ? 'text-slate-500 dark:text-slate-400'
    : visualState === 'substituted'
    ? 'text-slate-600 dark:text-slate-300'
    : 'text-slate-900 dark:text-white';

  const note = visualState === 'failed'
    ? 'Read failed'
    : visualState === 'stale'
    ? (age != null ? `Offline · ${age}s old` : 'Offline')
    : visualState === 'substituted'
    ? (age != null ? `Last good value · ${age}s old` : 'Last good value')
    : optimal;

  return (
    <div className={`relative p-4 rounded-xl border transition-all duration-300 ${cardClass}`}>
      <div className="absolute top-3 right-3">
        {visualState === 'failed'
          ? <span className="flex items-center gap-1 text-red-300/80 bg-red-400/10 px-1.5 py-0.5 rounded-full text-[10px]"><WifiOff size={9}/> Fault</span>
          : visualState === 'stale'
          ? <span className="flex items-center gap-1 text-slate-400/80 bg-slate-400/10 px-1.5 py-0.5 rounded-full text-[10px]"><WifiOff size={9}/> Offline</span>
          : visualState === 'substituted'
          ? <span className="flex items-center gap-1 text-slate-300/80 bg-slate-400/10 px-1.5 py-0.5 rounded-full text-[10px]"><Wifi size={9}/> Cached</span>
          : <span className="flex items-center gap-1 text-emerald-400/70 bg-emerald-400/10 px-1.5 py-0.5 rounded-full text-[10px]"><Wifi size={9}/> Live</span>}
      </div>

      <div className={`w-9 h-9 rounded-lg ${c.bg} ${c.border} border flex items-center justify-center mb-3`}>
        <Icon className={visualState === 'failed' ? 'text-red-500' : visualState === 'stale' ? 'text-slate-500' : visualState === 'substituted' ? 'text-slate-300' : c.text} size={18} />
      </div>

      <p className="text-slate-500 text-xs font-medium mb-1 truncate pr-8">{title}</p>

      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold tracking-tight ${valueClass}`}>
          {visualState === 'failed' ? '—' : formatValue(value)}
        </span>
        {unit && visualState !== 'failed' && <span className="text-slate-500 text-sm">{unit}</span>}
      </div>

      <p className="text-slate-600 text-[10px] mt-1.5">{note}</p>

      {visualState === 'failed' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500/70 rounded-b-xl" />}
    </div>
  );
}
