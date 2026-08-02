import React, { useState } from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const TABS = ['Temp & Oxygen', 'pH Trend', 'Water Level'];

export default function ChartsSection({ chartData, theme = 'dark' }) {
  const [activeTab, setActiveTab] = useState('Temp & Oxygen');
  const isDark = theme === 'dark';

  const gridStroke = isDark ? '#1e293b' : '#e2e8f0';
  const axisStroke = isDark ? '#475569' : '#94a3b8';
  const chartStyle = {
    contentStyle: {
      backgroundColor: isDark ? '#0d1526' : '#ffffff',
      border: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
      borderRadius: '10px',
      color: isDark ? '#f1f5f9' : '#0f172a',
      fontSize: 12,
    },
    itemStyle: { color: isDark ? '#cbd5e1' : '#334155' },
    labelStyle: { color: '#94a3b8' },
  };

  return (
    <div className="bg-white border border-slate-200 dark:bg-[#0d1526] dark:border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h3 className="text-slate-900 dark:text-white font-bold text-sm">Historical Sensor Data</h3>
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 rounded-lg p-1">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all
                ${activeTab === tab
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="h-64">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-600 text-sm">
            Waiting for sensor data...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {activeTab === 'Temp & Oxygen' ? (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="time" stroke={axisStroke} fontSize={11} tickMargin={8} />
                <YAxis yAxisId="left" stroke="#fb923c" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" stroke="#38bdf8" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip {...chartStyle} />
                <Legend wrapperStyle={{ paddingTop: 16, fontSize: 12 }} />
                <Line yAxisId="left" type="monotone" dataKey="temp" name="Temp (°C)" stroke="#fb923c" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
                <Line yAxisId="right" type="monotone" dataKey="oxygenLow" name="Oxygen low" stroke="#38bdf8" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
                <Line yAxisId="right" type="monotone" dataKey="oxygenHigh" name="Oxygen high" stroke="#7dd3fc" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
              </LineChart>
            ) : activeTab === 'pH Trend' ? (
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="phGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#a78bfa" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="time" stroke={axisStroke} fontSize={11} tickMargin={8} />
                <YAxis domain={[5, 10]} stroke="#a78bfa" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip {...chartStyle} />
                <Area type="monotone" dataKey="ph" name="pH" stroke="#a78bfa" strokeWidth={2.5} fill="url(#phGrad)" dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
              </AreaChart>
            ) : (
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#60a5fa" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="time" stroke={axisStroke} fontSize={11} tickMargin={8} />
                <YAxis domain={[0, 100]} stroke="#60a5fa" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip {...chartStyle} />
                <Area type="monotone" dataKey="water" name="Water Level (%)" stroke="#60a5fa" strokeWidth={2.5} fill="url(#waterGrad)" dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
