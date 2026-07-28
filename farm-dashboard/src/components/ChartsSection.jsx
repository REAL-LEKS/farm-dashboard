import React, { useState } from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const CHART_STYLE = {
  contentStyle: { backgroundColor: '#0d1526', border: '1px solid #1e293b', borderRadius: '10px', color: '#f1f5f9', fontSize: 12 },
  itemStyle: { color: '#cbd5e1' },
  labelStyle: { color: '#94a3b8' },
};

const TABS = ['Temp & Oxygen', 'pH Trend', 'Water Level'];

export default function ChartsSection({ chartData }) {
  const [activeTab, setActiveTab] = useState('Temp & Oxygen');

  return (
    <div className="bg-[#0d1526] border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h3 className="text-white font-bold text-sm">Historical Sensor Data</h3>
        <div className="flex gap-1 bg-slate-900 rounded-lg p-1">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all
                ${activeTab === tab
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'}`}
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
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" stroke="#475569" fontSize={11} tickMargin={8} />
                <YAxis yAxisId="left" stroke="#fb923c" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" stroke="#38bdf8" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip {...CHART_STYLE} />
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
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" stroke="#475569" fontSize={11} tickMargin={8} />
                <YAxis domain={[5, 10]} stroke="#a78bfa" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip {...CHART_STYLE} />
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
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" stroke="#475569" fontSize={11} tickMargin={8} />
                <YAxis domain={[0, 100]} stroke="#60a5fa" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip {...CHART_STYLE} />
                <Area type="monotone" dataKey="water" name="Water Level (%)" stroke="#60a5fa" strokeWidth={2.5} fill="url(#waterGrad)" dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
