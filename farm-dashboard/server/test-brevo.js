/**
 * test-brevo.js
 * Sends a test email via Brevo to confirm your API key works.
 * 
 * Usage:  node test-brevo.js
 */

import dotenv from 'dotenv';

dotenv.config();

const BREVO_API_KEY   = process.env.BREVO_API_KEY;
const BREVO_FROM      = process.env.BREVO_FROM_EMAIL;
const BREVO_FROM_NAME = process.env.BREVO_FROM_NAME || "Leks' Catfish Farm";
const ALERT_EMAIL     = process.env.ALERT_EMAIL;

// ── Validation ────────────────────────────────────────────────────────────────
if (!BREVO_API_KEY) {
  console.error('\n❌ BREVO_API_KEY is missing from your .env file');
  console.error('   Make sure your .env file is in the server/ folder\n');
  process.exit(1);
}
if (!BREVO_FROM) {
  console.error('\n❌ BREVO_FROM_EMAIL is missing from your .env file\n');
  process.exit(1);
}
if (!ALERT_EMAIL) {
  console.error('\n❌ ALERT_EMAIL is missing from your .env file\n');
  process.exit(1);
}

console.log('\n🐟  Leks Farm — Brevo Email Test');
console.log('   From:  ' + BREVO_FROM_NAME + ' <' + BREVO_FROM + '>');
console.log('   To:    ' + ALERT_EMAIL);
console.log('   Sending...\n');

// ── Send test email ───────────────────────────────────────────────────────────
async function sendTestEmail() {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: {
        email: BREVO_FROM,
        name: BREVO_FROM_NAME,
      },
      to: [{ email: ALERT_EMAIL }],
      subject: '✅ Leks Farm — Email Alerts Are Working!',
      htmlContent: `
        <div style="font-family:monospace;background:#0a0f1a;color:#e2e8f0;padding:24px;border-radius:12px;max-width:520px">
          <h2 style="color:#34d399;margin:0 0 16px">✅ Email Integration Successful!</h2>
          <hr style="border-color:#1e293b;margin-bottom:16px"/>
          <p style="margin:0 0 12px">Your Leks' Catfish Farm dashboard is now connected to Brevo.</p>
          <p style="margin:0 0 12px">You will receive alerts like this one whenever:</p>
          <ul style="color:#94a3b8;margin:0 0 16px;padding-left:20px">
            <li style="margin-bottom:6px">Water temperature goes out of range</li>
            <li style="margin-bottom:6px">pH level is too high or too low</li>
            <li style="margin-bottom:6px">Dissolved oxygen drops critically low</li>
            <li style="margin-bottom:6px">Ammonia gas reaches critical levels</li>
            <li style="margin-bottom:6px">Motion is detected at the pond</li>
          </ul>
          <hr style="border-color:#1e293b;margin-bottom:16px"/>
          <p style="color:#475569;font-size:11px;margin:0">
            Leks' Catfish Farm • Pond 1 • ${new Date().toLocaleString()}
          </p>
        </div>
      `,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('❌ Failed! Brevo responded with:');
    console.error(JSON.stringify(data, null, 2));
    console.error('\nCommon fixes:');
    console.error('  - Make sure BREVO_FROM_EMAIL is verified in your Brevo account');
    console.error('  - Go to Brevo → Senders & IPs → Verify your email address\n');
    process.exit(1);
  }

  console.log('✅ Email sent successfully!');
  console.log('   Message ID: ' + data.messageId);
  console.log('\n   Check your inbox at: ' + ALERT_EMAIL);
  console.log('   (Also check your spam folder if you don\'t see it)\n');
}

sendTestEmail().catch(err => {
  console.error('❌ Unexpected error:', err.message);
  process.exit(1);
});
