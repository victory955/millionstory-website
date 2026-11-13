// Receives a book submission from the "For Authors" form and emails it through Resend.
// Settings (set in Netlify, never in this file): RESEND_API_KEY, CONTACT_TO, CONTACT_FROM
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (code, body) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const clean = (v, n) => String(v || '').trim().slice(0, n);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
  let d;
  try { d = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Invalid request.' }); }

  const title = clean(d.title, 200), author = clean(d.author, 150), email = clean(d.email, 200);
  const genre = clean(d.genre, 100), date = clean(d.date, 30) || 'not given', tellus = clean(d.tellus, 5000);
  if (!title || !author || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: 'Please fill in the book title, your name and a valid email.' });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) return json(500, { error: 'The form is not set up yet.' });
  const to = process.env.CONTACT_TO || 'faith@millionstory.com';
  const from = process.env.CONTACT_FROM || 'Million Story <contact@millionstory.com>';

  const html = `<h2>New book submission</h2>
<p><b>Book title:</b> ${esc(title)}<br><b>Author:</b> ${esc(author)}<br><b>Email:</b> ${esc(email)}<br><b>Genre:</b> ${esc(genre || '-')}<br><b>Publication date:</b> ${esc(date)}</p>
<p style="white-space:pre-wrap">${esc(tellus || '(no description)')}</p>`;
  const text = `New book submission\n\nBook title: ${title}\nAuthor: ${author}\nEmail: ${email}\nGenre: ${genre || '-'}\nPublication date: ${date}\n\n${tellus}`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], reply_to: email, subject: `Book submission: ${title}`, html, text }),
    });
    if (!r.ok) { console.error('Resend error', r.status, await r.text()); return json(502, { error: 'Sorry, your submission could not be sent. Please try again.' }); }
    return json(200, { ok: true });
  } catch (e) {
    console.error(e);
    return json(502, { error: 'Sorry, your submission could not be sent. Please try again.' });
  }
};
