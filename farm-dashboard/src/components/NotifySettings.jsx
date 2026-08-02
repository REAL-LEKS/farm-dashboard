import React, { useState } from 'react';
import { Mail, Phone, MessageCircle, Send, Server, Save, CheckCircle, ToggleLeft, ToggleRight } from 'lucide-react';

export default function NotifySettings({ settings, setSettings, onSave }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [tgStatus, setTgStatus] = useState('');

  const update = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

  const detectTelegramChat = async () => {
    if (!settings.serverUrl) {
      setTgStatus('Set the Notification Server URL first.');
      return;
    }
    setTgStatus('Looking for chats…');
    try {
      const response = await fetch(`${settings.serverUrl}/api/telegram/chats`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setTgStatus(data.error || 'Could not query Telegram');
        return;
      }
      if (!data.chats?.length) {
        setTgStatus('No chats found. Open Telegram, send your bot any message, then try again.');
        return;
      }
      const chat = data.chats[data.chats.length - 1];
      update('telegram', String(chat.id));
      setTgStatus(`Found chat: ${chat.name} (${chat.id}) — click Save Settings to keep it.`);
    } catch {
      setTgStatus('Cannot reach backend server');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');

    if (onSave) {
      const result = await onSave(settings);
      if (!result?.ok) {
        setSaving(false);
        setSaved(false);
        setSaveError(result?.error || 'Failed to save settings');
        return;
      }
    }

    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white border border-slate-200 dark:bg-[#0d1526] dark:border-slate-800 rounded-xl p-5 space-y-5">
        <h3 className="text-slate-900 dark:text-white font-bold text-sm flex items-center gap-2">
          <Server size={16} className="text-emerald-400" /> Connection
        </h3>
        <Field
          label="Notification Server URL"
          placeholder="http://localhost:3001"
          value={settings.serverUrl}
          onChange={v => update('serverUrl', v)}
          help="The Node.js backend server. For remote access use your server's IP, e.g. http://192.168.1.100:3001"
        />
        <Field
          label="MQTT Broker URL"
          placeholder="wss://broker.emqx.io:8084/mqtt"
          value={settings.mqttUrl}
          onChange={v => update('mqttUrl', v)}
          help="WebSocket address of your MQTT broker. Default is the free public EMQX broker (online, works from anywhere). For a local broker use ws://localhost:9001"
        />
      </div>

      <ChannelCard
        icon={Mail} color="sky" title="Email Alerts"
        enabled={settings.emailEnabled}
        onToggle={() => update('emailEnabled', !settings.emailEnabled)}
      >
        <Field
          label="Recipient Email Address"
          placeholder="you@example.com"
          value={settings.email}
          onChange={v => update('email', v)}
          help="Sent via Brevo API (free: 300/day). Set BREVO_API_KEY in .env"
        />
      </ChannelCard>

      <ChannelCard
        icon={Phone} color="emerald" title="SMS Alerts"
        enabled={settings.smsEnabled}
        onToggle={() => update('smsEnabled', !settings.smsEnabled)}
      >
        <Field
          label="Phone Number (E.164 format)"
          placeholder="+447911123456"
          value={settings.phone}
          onChange={v => update('phone', v)}
          help="Sent via Twilio (free trial: $15 credit). Set TWILIO_* keys in .env"
        />
      </ChannelCard>

      <ChannelCard
        icon={Send} color="sky" title="Telegram Alerts"
        enabled={settings.telegramEnabled}
        onToggle={() => update('telegramEnabled', !settings.telegramEnabled)}
      >
        <Field
          label="Telegram Chat ID"
          placeholder="123456789"
          value={settings.telegram}
          onChange={v => update('telegram', v)}
          help="Free forever. Create a bot with @BotFather, set TELEGRAM_BOT_TOKEN on the server, send your bot one message, then click Detect below."
        />
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <button
            onClick={detectTelegramChat}
            className="text-xs font-semibold text-sky-600 dark:text-sky-300 border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 rounded-lg px-3 py-2 transition-colors"
          >
            Detect my Chat ID
          </button>
          {tgStatus && <p className="text-slate-400 text-[11px]">{tgStatus}</p>}
        </div>
      </ChannelCard>

      <ChannelCard
        icon={MessageCircle} color="green" title="WhatsApp Alerts"
        enabled={settings.whatsappEnabled}
        onToggle={() => update('whatsappEnabled', !settings.whatsappEnabled)}
      >
        <Field
          label="WhatsApp Number (E.164 format)"
          placeholder="+447911123456"
          value={settings.whatsapp}
          onChange={v => update('whatsapp', v)}
          help="Sent via Whapi.Cloud sandbox (free forever). Set WHAPI_TOKEN in .env"
        />
      </ChannelCard>

      <button
        onClick={handleSave}
        disabled={saving}
        className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all
          ${saving
            ? 'bg-slate-700 text-slate-300 cursor-not-allowed'
            : saved
            ? 'bg-emerald-700 text-white'
            : 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95'}`}
      >
        {saving
          ? <><Save size={16} /> Saving...</>
          : saved
            ? <><CheckCircle size={16} /> Saved!</>
            : <><Save size={16} /> Save Settings</>}
      </button>

      {saveError && <p className="text-red-400 text-xs">{saveError}</p>}

      <div className="bg-slate-50 border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800 rounded-xl p-5">
        <h4 className="text-slate-700 dark:text-slate-300 font-bold text-sm mb-3">🚀 Quick Setup Guide</h4>
        <ol className="space-y-2 text-slate-600 dark:text-slate-400 text-sm list-decimal list-inside">
          <li>Copy <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded text-xs">.env.example</code> → <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded text-xs">.env</code></li>
          <li>Sign up for <a href="https://app.brevo.com" target="_blank" rel="noreferrer" className="text-sky-400 underline">Brevo</a> (email) and add your API key</li>
          <li>Sign up for <a href="https://twilio.com" target="_blank" rel="noreferrer" className="text-emerald-400 underline">Twilio</a> (SMS) and add your credentials</li>
          <li>Sign up for <a href="https://whapi.cloud" target="_blank" rel="noreferrer" className="text-green-400 underline">Whapi.Cloud</a> (WhatsApp) and scan the QR code</li>
          <li>Run backend and frontend from this folder with <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded text-xs">npm run server</code> and <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded text-xs">npm run dev</code></li>
          <li>Enter your contact details above and click Save</li>
        </ol>
      </div>
    </div>
  );
}

function ChannelCard({ icon: Icon, color, title, enabled, onToggle, children }) {
  const colors = {
    sky: 'text-sky-400 bg-sky-400/10 border-sky-500/20',
    emerald: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20',
    green: 'text-green-400 bg-green-400/10 border-green-500/20',
  };
  return (
    <div className={`bg-white dark:bg-[#0d1526] border rounded-xl p-5 transition-all ${enabled ? 'border-slate-200 dark:border-slate-800' : 'border-slate-200/60 dark:border-slate-800/40 opacity-60'}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${colors[color]}`}>
            <Icon size={16} />
          </div>
          <h3 className="text-slate-900 dark:text-white font-bold text-sm">{title}</h3>
        </div>
        <button onClick={onToggle} className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
          {enabled ? <ToggleRight size={24} className="text-emerald-400" /> : <ToggleLeft size={24} />}
        </button>
      </div>
      <div className={enabled ? '' : 'pointer-events-none'}>{children}</div>
    </div>
  );
}

function Field({ label, placeholder, value, onChange, help }) {
  return (
    <div>
      <label className="block text-slate-500 dark:text-slate-400 text-xs font-semibold mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white border border-slate-300 text-slate-900 placeholder-slate-400 dark:bg-slate-900 dark:border-slate-700 dark:text-white dark:placeholder-slate-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500/60 transition-colors"
      />
      {help && <p className="text-slate-600 text-[11px] mt-1.5">{help}</p>}
    </div>
  );
}
