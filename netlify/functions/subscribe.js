// Adds a newsletter subscriber to your Resend contacts.
// Settings (set in Netlify): RESEND_API_KEY, and optionally RESEND_SEGMENT_ID to put people in a specific list.
const json = (code, body) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
  let d;
  try { d = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Invalid request.' }); }
  if (d.website) return json(200, { ok: true }); // spam trap

  const email = String(d.email || '').trim().toLowerCase().slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'Please enter a valid email address.' });

  const key = process.env.RESEND_API_KEY;
  if (!key) return json(500, { error: 'Subscriptions are not set up yet.' });

  const body = { email, unsubscribed: false };
  if (process.env.RESEND_SEGMENT_ID) body.segments = [{ id: process.env.RESEND_SEGMENT_ID }];

  try {
    const r = await fetch('https://api.resend.com/contacts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) return json(200, { ok: true });
    const t = await r.text();
    if (/already|exist/i.test(t)) return json(200, { ok: true }); // already subscribed
    console.error('Resend error', r.status, t);
    return json(502, { error: 'Sorry, we could not subscribe you right now. Please try again.' });
  } catch (e) {
    console.error(e);
    return json(502, { error: 'Sorry, we could not subscribe you right now. Please try again.' });
  }
};
