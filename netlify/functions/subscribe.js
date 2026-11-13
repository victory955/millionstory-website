// Adds a newsletter subscriber to MailerLite.
// Netlify environment variables:
//   MAILERLITE_API_KEY   (required)  your MailerLite API token (server side only)
//   MAILERLITE_GROUP_ID  (recommended) the numeric ID of the MailerLite group new subscribers should join
const json = (code, body) => ({
  statusCode: code,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const GENERIC = 'Sorry, we could not subscribe you right now. Please try again.';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });

  let d;
  try { d = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Invalid request.' }); }

  // Spam trap: bots fill the hidden "website" field. Pretend it worked and do nothing.
  if (d.website) return json(200, { ok: true });

  const email = String(d.email || '').trim().toLowerCase().slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: 'Please enter a valid email address.' });
  }

  const key = process.env.MAILERLITE_API_KEY;
  if (!key) {
    console.error('MAILERLITE_API_KEY is not set.');
    return json(500, { error: 'Subscriptions are not set up yet.' });
  }

  const body = { email };
  const group = String(process.env.MAILERLITE_GROUP_ID || '').trim();
  if (group) body.groups = [group];
  else console.warn('MAILERLITE_GROUP_ID is not set. Subscriber will be added without a group.');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);

  try {
    // MailerLite "create or update subscriber": a new email is created (201) and an
    // existing one is simply updated (200), so repeat sign-ups never create duplicates.
    const r = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    if (r.status === 200 || r.status === 201) return json(200, { ok: true });

    const t = await r.text();
    if (r.status === 422) {
      if (/already|exist/i.test(t)) return json(200, { ok: true }); // already on the list
      console.error('MailerLite rejected the request', r.status, t);
      return json(400, { error: 'That email address could not be added. Please check it and try again.' });
    }
    if (r.status === 429) return json(429, { error: 'Too many sign-ups right now. Please try again in a minute.' });
    if (r.status === 401 || r.status === 403) {
      console.error('MailerLite authentication failed. Check MAILERLITE_API_KEY.', r.status);
      return json(500, { error: 'Subscriptions are not set up yet.' });
    }
    console.error('MailerLite error', r.status, t);
    return json(502, { error: GENERIC });
  } catch (e) {
    console.error('MailerLite request failed', e && e.message);
    return json(502, { error: GENERIC });
  } finally {
    clearTimeout(timer);
  }
};
