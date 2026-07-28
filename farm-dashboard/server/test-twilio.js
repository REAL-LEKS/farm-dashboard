/**
 * test-twilio.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Sends a test SMS via Twilio to confirm your credentials work.
 *
 * Usage:
 *   node test-twilio.js
 */

import dotenv from 'dotenv';

dotenv.config();

const SID       = process.env.TWILIO_SID;
const TOKEN     = process.env.TWILIO_AUTH_TOKEN;
const FROM      = process.env.TWILIO_FROM;
const TO        = process.env.ALERT_PHONE;

// ── Validate env ──────────────────────────────────────────────────────────────
const missing = [];
if (!SID)   missing.push('TWILIO_SID');
if (!TOKEN) missing.push('TWILIO_AUTH_TOKEN');
if (!FROM)  missing.push('TWILIO_FROM');
if (!TO)    missing.push('ALERT_PHONE');

if (missing.length) {
  console.error('\n❌  Missing values in your .env file:');
  missing.forEach(k => console.error('    • ' + k));
  console.error('\nOpen farm-dashboard\\server\\.env and fill them in.\n');
  process.exit(1);
}

console.log('\n🐟  Leks Farm — Twilio SMS Test');
console.log('    From:  ' + FROM);
console.log('    To:    ' + TO);
console.log('    Sending...\n');

const credentials = Buffer.from(SID + ':' + TOKEN).toString('base64');
const body = new URLSearchParams({
  From: FROM,
  To:   TO,
  Body: "✅ Test from Leks' Catfish Farm! Your SMS alerts are working. Pond 1 is being monitored.",
});

fetch('https://api.twilio.com/2010-04-01/Accounts/' + SID + '/Messages.json', {
  method:  'POST',
  headers: {
    'Authorization': 'Basic ' + credentials,
    'Content-Type':  'application/x-www-form-urlencoded',
  },
  body: body.toString(),
})
  .then(async res => {
    const data = await res.json();
    if (!res.ok) {
      console.error('❌  Twilio error ' + res.status + ':');
      console.error('    ' + (data.message || JSON.stringify(data)));
      console.error('\nCommon fixes:');
      console.error('  • "21608" — recipient number not verified. Go to:');
      console.error('    console.twilio.com → Phone Numbers → Verified Caller IDs');
      console.error('    and add your +234 number there first.\n');
      process.exit(1);
    }
    console.log('✅  SMS sent successfully!');
    console.log('    Message SID: ' + data.sid);
    console.log('    Status:      ' + data.status);
    console.log('\n    Check your phone (' + TO + ') for the message!\n');
  })
  .catch(err => {
    console.error('❌  Request failed:', err.message);
    process.exit(1);
  });
