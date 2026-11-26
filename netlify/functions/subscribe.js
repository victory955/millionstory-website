// Million Story newsletter sign-up -> MailerLite (server side only).
// The MailerLite API key never reaches the browser: the website posts to this function and
// this function talks to MailerLite.
//
// Netlify environment variables (Site configuration > Environment variables):
//   MAILERLITE_API_KEY   (required)  MailerLite API token (Integrations > MailerLite API).
//   MAILERLITE_GROUP_ID  (required)  Numeric ID of the Million Story newsletter group. New subscribers
//                                    join this group, which is what starts a "joins a group" welcome automation.
//
// Request body (JSON): { email, name?, consent?, source?, website?, elapsed? }
//   - website  : hidden spam-trap field. Real visitors leave it empty.
//   - elapsed  : milliseconds the form was open. Impossibly fast submissions are treated as bots.
//   - source   : "popup" = the Million Story sign-up form, which requires consent === true.
//                (The compact footer form sends no source and keeps working as before.)
const json = (code, body) => ({
  statusCode: code,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

const GENERIC = 'Sorry, we could not subscribe you right now. Please try again.';
const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-f:]+:[0-9a-f:]*$/i;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });

  let d;
  try { d = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Invalid request.' }); }
  if (!d || typeof d !== 'object') return json(400, { error: 'Invalid request.' });

  // Spam traps: a filled hidden field, or a form "submitted" faster than a person can type.
  // Pretend it worked and do nothing, so bots learn nothing.
  if (d.website) return json(200, { ok: true });
  if (typeof d.elapsed === 'number' && d.elapsed < 1200) return json(200, { ok: true });

  const email = String(d.email || '').trim().toLowerCase().slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: 'Please enter a valid email address.' });
  }

  // Consent is enforced here too, not only in the browser.
  if (d.source === 'popup' && d.consent !== true) {
    return json(400, { error: 'Please tick the box to confirm you would like to receive our newsletter.' });
  }

  const key = process.env.MAILERLITE_API_KEY;
  if (!key) {
    console.error('MAILERLITE_API_KEY is not set.');
    return json(500, { error: 'Subscriptions are not set up yet.' });
  }

  const name = String(d.name || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const body = { email };
  if (name) body.fields = { name }; // only sent when given, so an existing name is never blanked
  const group = String(process.env.MAILERLITE_GROUP_ID || '').trim();
  if (group) body.groups = [group];
  else console.warn('MAILERLITE_GROUP_ID is not set. Subscriber will be added without a group (no group-based welcome automation).');
  const h = event.headers || {};
  const ip = String(h['x-nf-client-connection-ip'] || h['client-ip'] || '').trim();
  if (IP_RE.test(ip)) body.ip_address = ip; // lets MailerLite keep the sign-up IP for its records

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);

  try {
    // MailerLite "create or update subscriber": a new email is created (201) and an existing
    // one is updated (200), so repeat sign-ups never create duplicates.
    const r = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    if (r.status === 201) return json(200, { ok: true, existing: false });
    if (r.status === 200) return json(200, { ok: true, existing: true });

    const t = await r.text();
    if (r.status === 422) {
      if (/already|exist/i.test(t)) return json(200, { ok: true, existing: true });
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
