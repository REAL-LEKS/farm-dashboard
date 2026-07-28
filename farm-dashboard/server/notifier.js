/**
 * notifier.js
 * Handles all outbound notification channels:
 *   - SMS via Twilio
 *   - Email via Brevo (free: 300/day)
 *   - WhatsApp via Whapi.Cloud (free sandbox)
 */

export async function sendSMS(to, message) {
  const { TWILIO_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM } = process.env;
  if (!TWILIO_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM) {
    throw new Error('Twilio env vars not set (TWILIO_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM)');
  }

  const creds = Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: message }),
    }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Twilio SMS failed');
  return data;
}

export async function sendEmail(to, subject, htmlContent) {
  const { BREVO_API_KEY, BREVO_FROM_EMAIL, BREVO_FROM_NAME } = process.env;
  if (!BREVO_API_KEY) {
    throw new Error('BREVO_API_KEY not set');
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: {
        email: BREVO_FROM_EMAIL || 'alerts@farm.local',
        name: BREVO_FROM_NAME || "Leks' Catfish Farm",
      },
      to: [{ email: to }],
      subject,
      htmlContent,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Brevo email failed (${res.status})`);
  }
  return res.json();
}

export async function sendWhatsApp(to, message) {
  const WHAPI_TOKEN = (process.env.WHAPI_TOKEN || '').trim();
  const WHAPI_CHANNEL_URL = (process.env.WHAPI_CHANNEL_URL || '').trim();
  if (!WHAPI_TOKEN) {
    throw new Error('WHAPI_TOKEN not set');
  }

  const recipient = to.replace(/^\+/, '') + '@s.whatsapp.net';
  const rawBaseUrl = (WHAPI_CHANNEL_URL || 'https://gate.whapi.cloud').replace(/\/+$/, '');
  const normalizedBaseUrl = rawBaseUrl
    .replace(/\/channels\/[^/]+$/i, '')
    .replace(/\/messages\/text$/i, '');
  const endpoint = `${normalizedBaseUrl}/messages/text`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHAPI_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to: recipient, body: message }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Whapi WhatsApp failed (${res.status})`);
  }
  return res.json();
}
