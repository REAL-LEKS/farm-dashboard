/**
 * test-whapi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Sends a test WhatsApp message via Whapi.Cloud to confirm setup works.
 *
 * Usage:
 *   node test-whapi.js
 */

import dotenv from 'dotenv';

dotenv.config();

const TOKEN       = (process.env.WHAPI_TOKEN || '').trim();
const CHANNEL_URL = (process.env.WHAPI_CHANNEL_URL || 'https://gate.whapi.cloud').trim();
const TO          = (process.env.ALERT_WHATSAPP || '').trim();

// ── Validate env ──────────────────────────────────────────────────────────────
const missing = [];
if (!TOKEN)       missing.push('WHAPI_TOKEN');
if (!TO)          missing.push('ALERT_WHATSAPP');

if (missing.length) {
  console.error('\n❌  Missing values in your .env file:');
  missing.forEach(k => console.error('    • ' + k));
  console.error('\nOpen farm-dashboard\\server\\.env and fill them in.\n');
  process.exit(1);
}

// ── Format number (Whapi wants number without +) ──────────────────────────────
const toFormatted = TO.replace(/^\+/, '') + '@s.whatsapp.net';

console.log('\n🐟  Leks Farm — Whapi WhatsApp Test');
console.log('    Channel: ' + CHANNEL_URL);
console.log('    To:      ' + TO);
console.log('    Sending...\n');

const rawBaseUrl = CHANNEL_URL.replace(/\/+$/, '');
const normalizedBaseUrl = rawBaseUrl
  .replace(/\/channels\/[^/]+$/i, '')
  .replace(/\/messages\/text$/i, '');
const endpoint = normalizedBaseUrl + '/messages/text';

fetch(endpoint, {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + TOKEN,
    'Content-Type':  'application/json',
  },
  body: JSON.stringify({
    to:   toFormatted,
    body: "✅ Test from Leks' Catfish Farm!\n\nYour WhatsApp alerts are working. Pond 1 is being monitored 🐟\n\nYou'll receive alerts here when sensors go out of range.",
  }),
})
  .then(async res => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('❌  Whapi error ' + res.status + ':');
      console.error('    ' + (data.message || data.error?.message || JSON.stringify(data)));
      console.error('    Endpoint: ' + endpoint);
      console.error('\nCommon fixes:');
      console.error('  • "Unauthorized" — check your WHAPI_TOKEN in .env');
      console.error('  • "Not found"    — set WHAPI_CHANNEL_URL=https://gate.whapi.cloud');
      console.error('  • Number format  — make sure ALERT_WHATSAPP starts with +234\n');
      process.exit(1);
    }
    console.log('✅  WhatsApp message sent successfully!');
    console.log('    Message ID: ' + (data.id || data.message?.id || 'n/a'));
    console.log('\n    Check WhatsApp on your phone (' + TO + ')!\n');
  })
  .catch(err => {
    console.error('❌  Request failed:', err.message);
    process.exit(1);
  });
