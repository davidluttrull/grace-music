/**
 * Grace Music - weekly song email helper.
 *
 * This runs in David's PERSONAL Google account (dmluttrull@gmail.com), not in
 * the Music Schedule Sheet, so the team email keeps going out from the
 * personal address (school addresses get flagged as spam when they send to
 * this many people). See SETUP.md, "Weekly song email".
 *
 * The builder's "Make email drafts" button (through this project's web app)
 * makes this week's email as two Gmail drafts, one for each half of the team
 * (the same two BCC lists as before). Nothing is ever sent; David adds his
 * personal touch and sends them. Drafts are only made when he clicks the
 * button, unless DRAFT_DAY is set for a weekly run.
 *
 * Where everything comes from:
 * - The schedule and saved orders of service: the Music Schedule's public
 *   feed (the same one the volunteer page and builder read). The orders' team
 *   email notes aren't public, so this asks for them with the order code,
 *   stored here as the ORDER_CODE script property (the same code the builder uses).
 * - The PDFs: "YYYY-MM-DD_Musicians Order of Service.pdf" (the two-sided copy
 *   with arrangements; the regular "YYYY-MM-DD_Order of Service.pdf" if there
 *   isn't one) and "YYYY-MM-DD_AM.pdf" in the Orders of Service folder, shared
 *   from the school Drive with this account.
 * - The recipients: the "Song Email Lists" sheet that setupEmailHelper makes
 *   in this account's Drive, filled from the last song email in Sent mail.
 */

const FEED_URL = 'https://script.google.com/macros/s/AKfycbyN_FOd4twDKmMrDk5l3NqTmKRJrKhIC3kUgkuumCKGoxK_wlkFxZlWevtGUyPtSnPE8Q/exec';
// Orders of Service (school Drive, shared with this account). Attachments only come from its
// year / month folders, so a same-named PDF someone else shares with this account is never used.
const ORDERS_FOLDER = '0B_yrCm_KORazWDBYMUdXX1RrT1E';
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const LISTS_PROP = 'LISTS_SHEET_ID';
const KEY_PROP = 'HELPER_KEY';
const ORDER_CODE_PROP = 'ORDER_CODE';   // the builder's order code, to read the team email notes
const DRAFT_DAY = '';                 // '' = only when the builder's button is clicked; 'TUESDAY' = also every Tuesday
const DRAFT_HOUR = 12;                // the weekly run's hour, if DRAFT_DAY is set
const CHOIR_LEADER = 'Kevin Plew';    // leads the choir unless the order says otherwise
const SENT_SEARCH = 'in:sent subject:"Upcoming Assignments"';

// "Next Sunday" lists these, in this order: [schedule role, label in the email].
// Prelude is only listed when it isn't the pianist.
const NEXT_ROLES = [['Prelude', 'Prelude'], ['Piano', 'Piano'], ['Synth', 'Synth'], ['Guitar', 'Guitar'],
  ['Electric Guitar', 'E Guitar'], ['Bass Guitar', 'Bass']];
// Order of service items every week has; anything else gets a line under Notes.
const USUAL_ITEMS = /^(prelude|announcement video|announcements?( \/ prayer)?|hymn|closing( hymn)?|scripture reading( \/ prayer)?|offering|special|message|sermon|prayer( time)?|bible study)$/i;
const CANCELLED = /cancel|^\s*no\b.*\bservice/i;
const CANCEL_PREFIX = /^\s*(cancel+ed|no\b.*?\bservice)\s*(?:[–—:-]\s*)?/i;

// ---------- Setup (run these from the editor) ----------

/** Run once: makes the recipient lists and a private key for the builder's button, plus the weekly
 * trigger if DRAFT_DAY is set. Running it again (after a change to DRAFT_DAY or DRAFT_HOUR) turns the
 * weekly run on, off, or to another time, and leaves the lists and key alone. */
function setupEmailHelper() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty(KEY_PROP)) props.setProperty(KEY_PROP, Utilities.getUuid().replace(/-/g, '').slice(0, 16));
  let id = props.getProperty(LISTS_PROP);
  if (!id) {
    const ss = SpreadsheetApp.create('Song Email Lists');
    const lists = listsFromSentMail_();
    const rows = Math.max(lists[0].length, lists[1].length);
    const values = [['Email 1', 'Email 2']];
    for (let i = 0; i < rows; i++) values.push([lists[0][i] || '', lists[1][i] || '']);
    const sheet = ss.getSheets()[0];
    sheet.setName('Lists');
    sheet.getRange(1, 1, values.length, 2).setValues(values);
    sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, 2, 300);
    id = ss.getId();
    props.setProperty(LISTS_PROP, id);
    console.log('Made "Song Email Lists" with ' + lists[0].length + ' + ' + lists[1].length + ' addresses: ' + ss.getUrl());
  }
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'weeklyDrafts')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  if (!DRAFT_DAY) {
    console.log('No weekly run: drafts are made only when you click Make email drafts in the builder. If this is a first-time setup: deploy as a web app, then run builderLink.');
    return;
  }
  ScriptApp.newTrigger('weeklyDrafts').timeBased().onWeekDay(ScriptApp.WeekDay[DRAFT_DAY]).atHour(DRAFT_HOUR).create();
  const day = DRAFT_DAY.charAt(0) + DRAFT_DAY.slice(1).toLowerCase();
  console.log('Drafts will be made every ' + day + ' around ' + DRAFT_HOUR + ':00. If this is a first-time setup: deploy as a web app, then run builderLink.');
}

/** Run after deploying the web app: prints the link to paste into the builder's "Make email drafts" button. */
function builderLink() {
  const url = ScriptApp.getService().getUrl();
  if (!url) throw new Error('Deploy this project as a web app first (Deploy → New deployment → Web app).');
  const key = '?key=' + PropertiesService.getScriptProperties().getProperty(KEY_PROP);
  if (/\/dev$/.test(url)) {
    // From the editor Google sometimes reports the owner-only test address.
    console.log('Copy the Web app URL (ending in /exec) from Deploy → Manage deployments and add ' + key + ' to the end.');
  } else {
    console.log('Builder link: ' + url + key);
  }
}

/** Run any time to make this week's drafts right now (replacing ones already made for this Sunday). */
function makeDraftsNow() {
  const res = makeDrafts_(comingSunday_(), true);
  console.log(summary_(res));
}

// ---------- Triggers ----------

/** Weekly trigger (only if DRAFT_DAY is set). Leaves drafts alone if they were already made (and maybe edited) this week. */
function weeklyDrafts() {
  const sunday = comingSunday_();
  const subject = subjectFor_(sunday);
  const me = Session.getEffectiveUser().getEmail();
  if (existingDrafts_(subject).length) return;
  const res = makeDrafts_(sunday, false);
  GmailApp.sendEmail(me, 'Song email drafts are ready (' + shortDate_(sunday) + ')',
    summary_(res) + '\n\nOpen Gmail → Drafts, add your personal note, and send both.');
}

/** The builder's "Make email drafts" button: ?key=...&date=YYYY-MM-DD. */
function doGet(e) {
  const p = (e && e.parameter) || {};
  const page = (title, body) => HtmlService.createHtmlOutput(
    '<div style="font:15px/1.5 system-ui,sans-serif;max-width:520px;margin:40px auto;padding:0 16px">' +
    '<h2 style="margin:0 0 8px">' + title + '</h2>' + body + '</div>').setTitle('Song email');
  if (!p.key || p.key !== PropertiesService.getScriptProperties().getProperty(KEY_PROP)) {
    return page("That link isn't right", '<p>Run <b>builderLink</b> in the email helper project, then in the builder click <b>Change email link</b> and paste the new link.</p>');
  }
  try {
    const sunday = /^\d{4}-\d{2}-\d{2}$/.test(p.date || '') ? p.date : comingSunday_();
    const res = makeDrafts_(sunday, true);
    return page('Drafts ready', '<p>' + esc_(summary_(res)).replace(/\n/g, '<br>') + '</p>' +
      '<p><a href="https://mail.google.com/mail/u/0/#drafts" target="_blank" rel="noopener" style="font-weight:600">Open Gmail drafts</a> (opens in a new tab)</p>');
  } catch (err) {
    return page("Couldn't make the drafts", '<p>' + esc_(err.message) + '</p>');
  }
}

// ---------- Making the drafts ----------

function makeDrafts_(sunday, replace) {
  const code = PropertiesService.getScriptProperties().getProperty(ORDER_CODE_PROP);
  if (!code) {
    throw new Error('Add the order code as ORDER_CODE in this project\'s Project Settings \u2192 Script Properties ' +
      '(the same code the builder asks for), so the drafts can include your notes.');
  }
  const ordersRequest = { url: FEED_URL, method: 'post', contentType: 'text/plain',
    payload: JSON.stringify({ action: 'orders', code: code }) };
  const [feed, orders] = fetchJsonAll_([FEED_URL, ordersRequest]);   // both at once
  if (feed.status === 'error') throw new Error(feed.message);
  if (orders.status === 'badcode') throw new Error('The ORDER_CODE script property isn\u2019t the builder\u2019s order code. Fix it and try again.');
  if (orders.status === 'error') throw new Error(orders.message);
  const email = buildEmail_(sunday, feed.services || [], orders.orders || {}, orders.templates || {});
  const found = findPdfs_(email.attachments.concat(Object.values(email.fallbacks)));
  // A missing musicians' copy falls back to the regular order of service.
  const files = email.attachments.map((name) => {
    const alt = email.fallbacks[name];
    if (!found[name] && alt && found[alt]) return { name: alt, file: found[alt] };
    return { name, file: found[name] || null };
  });
  const blobs = files.filter((f) => f.file).map((f) => f.file.getBlob().setName(f.name));
  const missing = files.filter((f) => !f.file).map((f) => f.name);
  const lists = readLists_().filter((l) => l.length);
  if (!lists.length) throw new Error('The "Song Email Lists" sheet has no addresses.');

  const old = existingDrafts_(email.subject);
  const attached = files.filter((f) => f.file).map((f) => f.name);
  if (old.length && !replace) return { email, made: 0, kept: old.length, missing, attached, lists };
  old.forEach((d) => d.remove());
  const html = email.html + signature_();
  lists.forEach((bcc) => {
    const opts = { htmlBody: html, bcc: bcc.join(','), attachments: blobs };
    try {
      GmailApp.createDraft('', email.subject, email.text, opts);
    } catch (err) {   // in case Gmail insists on a To address
      GmailApp.createDraft(Session.getEffectiveUser().getEmail(), email.subject, email.text, opts);
    }
  });
  return { email, made: lists.length, kept: 0, missing, attached, lists };
}

function summary_(res) {
  const lines = [];
  if (res.made) lines.push('Made ' + res.made + ' drafts of "' + res.email.subject + '" (' + res.lists.map((l) => l.length).join(' + ') + ' people).');
  else lines.push('Drafts of "' + res.email.subject + '" were already made, so they were left alone.');
  if (res.missing.length) lines.push('Not attached (not in the Orders of Service folder yet): ' + res.missing.join(', ') + '.');
  else lines.push('Attached: ' + res.attached.join(', ') + '.');
  return lines.join('\n');
}

/**
 * The email for the Sunday `sunday` ("2026-10-18"), from the schedule feed and
 * the saved orders (templates: for the remembered song arrangements). Returns { subject, text, html, attachments } where
 * attachments are the PDF names to look for (fallbacks: a name to use when one is missing).
 */
function buildEmail_(sunday, services, orders, templates) {
  const week = [0, 7, 14, 21].map((n) => addDays_(sunday, n));
  const svc = (date, service) => services.find((s) => s.date === date && s.service === service) || null;
  const order = (date, service) => orders[date + '|' + service] || orders[date + '|Custom ' + service] || null;
  const am = order(sunday, 'Sunday AM'), pm = order(sunday, 'Sunday PM');
  const email = (am && am.email) || {};

  const notes = thisSundayNotes_(sunday, svc, order);
  (email.notes || '').split('\n').map((s) => s.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean).forEach((n) => notes.push(n));
  if (!notes.length) notes.push('This coming Sunday is a normal order of service.');

  const blocks = [];
  // Next Sunday: the instrumentalists, then offering and special.
  const next = svc(week[1], 'Sunday AM');
  const nextLines = [];
  if (next) {
    const v = (role) => valueOf_(next, role);
    NEXT_ROLES.forEach(([role, label]) => {
      if (role === 'Prelude' && v('Prelude') === v('Piano')) return;
      if (v(role)) nextLines.push(label + ': ' + v(role));
    });
  }
  blocks.push({ title: 'Next Sunday (' + shortDate_(week[1]) + ')', extra: aboutService_(next), lines: nextLines, gift: giftLines_(next) });
  blocks.push({ title: 'Two Sundays Out (' + shortDate_(week[2]) + ')', extra: aboutService_(svc(week[2], 'Sunday AM')), lines: [], gift: giftLines_(svc(week[2], 'Sunday AM')) });
  blocks.push({ title: 'Three Sundays Out (' + shortDate_(week[3]) + ')', extra: aboutService_(svc(week[3], 'Sunday AM')), lines: [], gift: giftLines_(svc(week[3], 'Sunday AM')) });

  const greeting = 'Good afternoon,';
  const intro = (email.intro || '').trim() || "Hope you've had a great week!";
  const sections = orderSections_(sunday, svc, order, ((templates || {}).Arrangements || {}).songs || {});
  const attachSentence = sections.length
    ? "This Sunday's order of service is below (and attached, if you'd like to print it), along with the song scans for the next two Sundays."
    : 'Attached is the order of service for this Sunday and the song scans for the next two Sundays.';

  // Plain text
  let text = greeting + '\n\n' + intro + ' ' + attachSentence + '\n\nNotes:\n' +
    notes.map((n) => '- ' + n).join('\n') + '\n';
  sections.forEach((sec) => {
    text += '\n' + sec.title.toUpperCase() + (sec.right ? ' - ' + sec.right : '') + '\n';
    if (sec.off) text += sec.off + '\n';
    if (sec.leader) text += 'Music Leader: ' + sec.leader + '\n';
    sec.lines.forEach((l) => {
      text += l.label + (l.note ? ' (' + l.note + ')' : '') + (l.value ? ': ' + l.value : '') + (l.verses ? ' ' + l.verses : '') + '\n';
      if (l.arr) text += l.arr.split('\n').map((a) => '    ' + a).join('\n') + '\n';
    });
    sec.credits.forEach(([h, list]) => { text += h + ': ' + list.map(([k, v]) => k + ' ' + v).join(', ') + '\n'; });
  });
  text += '\nI think that covers everything!\n';
  blocks.forEach((b) => {
    text += '\n' + b.title + (b.extra ? ' - ' + b.extra : '') + '\n';
    if (!b.lines.length && !b.gift.length) { text += 'TBA\n'; return; }
    if (b.lines.length) text += b.lines.join('\n') + '\n' + (b.gift.length ? '\n' : '');
    if (b.gift.length) text += b.gift.join('\n') + '\n';
  });

  // HTML in the church's colors (the volunteer page's greens), with inline styles because Gmail drops <style>.
  const C = EMAIL_COLORS;
  const box = (bg, inner) => '<div style="padding:0 7px 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + bg + ';' +
    (bg === '#fff' ? 'border:1px solid ' + C.line + ';' : '') + 'border-radius:12px"><tr><td style="padding:16px 20px">' + inner + '</td></tr></table></div>';
  const card = (inner) => box('#fff', inner);
  // A column that sits side by side on a wide screen and full width on a phone. No media queries (Gmail's
  // editor drops <style>): below WIDE the calc() width is huge and max-width wins; above it, min-width wins.
  // A mail app without calc() just stacks them, like a phone.
  const WIDE = 760;
  const column = (share, inner) => '<div style="display:inline-block;vertical-align:top;text-align:left;font-size:14px;width:100%;' +
    'min-width:' + share + '%;max-width:100%;width:calc((' + WIDE + 'px - 100%) * 1000)">' + inner + '</div>';
  const h2 = (t, right) => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:2px solid ' + C.brand + ';margin:0 0 8px"><tr>' +
    '<td style="font-size:17px;font-weight:700;color:' + C.deep + ';padding:0 0 4px">' + esc_(t) + '</td>' +
    (right ? '<td align="right" style="font-size:12px;color:' + C.muted + ';padding:0 0 4px">' + esc_(right) + '</td>' : '') + '</tr></table>';
  const p = (inner, extra) => '<p style="margin:0 0 10px;' + (extra || '') + '">' + inner + '</p>';

  const notesCard = card(p(esc_(greeting)) + p(esc_(intro) + ' ' + esc_(attachSentence)) +
    '<div style="font-weight:700;color:' + C.deep + ';margin:14px 0 4px">Notes</div>' +
    '<ul style="margin:0;padding:0 0 0 20px">' + notes.map((n) => '<li style="margin:0 0 4px">' + esc_(n) + '</li>').join('') + '</ul>');
  let orderCard = '';
  if (sections.length) {
    orderCard = card('<div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:' + C.mid + ';margin:0 0 10px">THIS SUNDAY\'S ORDER OF SERVICE</div>' +
      sections.map((sec, k) => '<div style="' + (k ? 'margin-top:18px' : '') + '">' + sectionHtml_(sec) + '</div>').join(''));
  }
  const upcomingCard = card(h2('Upcoming Assignments') + blocks.map((b, k) => {
    let out = '<div style="' + (k ? 'margin-top:14px' : 'margin-top:4px') + '"><div style="font-weight:700;color:' + C.deep + '">' + esc_(b.title) + '</div>' +
      (b.extra ? '<div style="font-size:13px;color:' + C.mid + ';margin:1px 0 3px">' + esc_(b.extra) + '</div>' : '');
    if (!b.lines.length && !b.gift.length) return out + '<div style="color:' + C.muted + '">TBA</div></div>';
    out += b.lines.map((l) => '<div>' + labelled_(l) + '</div>').join('');
    if (b.lines.length && b.gift.length) out += '<div style="height:6px"></div>';
    return out + b.gift.map((l) => '<div>' + labelled_(l) + '</div>').join('') + '</div>';
  }).join('') + p('I think that covers everything!', 'margin:16px 0 0'));

  // Phone: header, notes, order, assignments, one under another. Wide screen: the order beside the assignments.
  const columns = orderCard
    ? '<div style="font-size:0;text-align:center">' + column(63, orderCard) + column(37, upcomingCard) + '</div>'
    : upcomingCard;
  const html = '<div style="background:' + C.bg + ';padding:16px 1px;font-family:Poppins,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.45;color:' + C.ink + '">' +
    '<div style="max-width:980px;margin:0 auto">' +
    box(C.deep, '<div style="font-size:12px;font-weight:600;letter-spacing:.08em;color:' + C.brand + '">GRACE BAPTIST CHURCH \u00b7 MUSIC</div>' +
      '<div style="font-size:21px;font-weight:700;color:#fff;margin-top:2px">Sunday, ' + esc_(longDate_(sunday)) + '</div>') +
    notesCard + columns + '</div></div>';

  return {
    subject: subjectFor_(sunday),
    text,
    html,
    attachments: [sunday + '_Musicians Order of Service.pdf', sunday + '_AM.pdf', week[1] + '_AM.pdf'],
    fallbacks: { [sunday + '_Musicians Order of Service.pdf']: sunday + '_Order of Service.pdf' },
  };
}

const EMAIL_COLORS = { brand: '#7BAE58', deep: '#233617', mid: '#4E7A35', bg: '#F3F8EF', ink: '#1E2A16', muted: '#5B6A50', line: '#DCE7D3' };
const SERVICE_LABEL = { 'Sunday AM': 'Sunday Morning', 'Sunday PM': 'Sunday Evening' };
// The team credits under each service, as on the printed sheet: [schedule role, label].
const CREDIT_GROUPS = [
  ['Accompanists', [['Piano', 'Piano'], ['Synth', 'Synth'], ['Strings', 'Strings'], ['Guitar', 'Guitar'], ['Electric Guitar', 'E. Guitar'], ['Bass Guitar', 'Bass']]],
  ['Singers', [['Soprano', 'Soprano'], ['Alto', 'Alto'], ['Tenor', 'Tenor'], ['Bass', 'Bass'], ['Alt (Women)', 'Alt'], ['Alt (Men)', 'Alt']]],
  ['Media', [['Slides', 'Slides'], ['House Audio', 'House'], ['Livestream Audio', 'Stream'], ['Video Mixer', 'Video']]],
];

/**
 * This Sunday's saved orders, ready to show in the email body: [{ title, right, leader, off, lines, credits }].
 * Works like the builder's sheet: linked items read the schedule, empty ones are left off, and a song shows
 * its arrangement (typed on that order, or the one remembered from the last time it was sung).
 * A service with no saved order is skipped (the attachment still has it).
 */
function orderSections_(sunday, svc, order, book) {
  const out = [];
  ['Sunday AM', 'Sunday PM'].forEach((service) => {
    const o = order(sunday, service);
    if (!o || !o.items) return;
    const s = svc(sunday, service);
    const role = (r) => (s ? valueOf_(s, r) : ((o.team || {})[r] || ''));
    const title = SERVICE_LABEL[service];
    const note = role('Service Notes') || (o.team && o.team['Service Notes']) || '';
    if (note && CANCELLED.test(note)) { out.push({ title, right: longDate_(sunday), off: note, leader: '', lines: [], credits: [] }); return; }
    const right = [role('Time'), note].filter(Boolean).join(' · ');
    const lines = [];
    o.items.forEach((it) => {
      const value = String(it.value || (it.source ? role(it.source) : '') || '').trim();
      if (it.hidden || (it.source && !value)) return;
      const line = { label: String(it.label || '').trim(), note: String(it.note || '').trim(), value, verses: String(it.verses || '').trim(), song: null, arr: '' };
      line.italic = it.italic || /^offering\b/i.test(line.label);
      if (it.kind === 'song') {
        line.song = parseSong_(value);
        const key = songKey_(value);
        if (it.arrangement !== undefined && (it.arrangementFor === undefined || it.arrangementFor === key)) line.arr = String(it.arrangement).trim();
        else if (service === 'Sunday AM' && key && book[key]) line.arr = String(book[key].text || '').trim();
      }
      lines.push(line);
    });
    const credits = o.credits === false ? [] : CREDIT_GROUPS.map(([h, roles]) =>
      [h, roles.map(([r, label]) => [label, role(r)]).filter(([, v]) => v)]).filter(([, list]) => list.length);
    out.push({ title, right, off: '', leader: role('Leading') || role('Song Leading') || o.leader || '', lines, credits });
  });
  return out;
}

/** One service in the email body, laid out like the printed sheet. */
function sectionHtml_(sec) {
  const C = EMAIL_COLORS;
  let html = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:2px solid ' + C.brand + ';margin:0 0 6px"><tr>' +
    '<td style="font-size:17px;font-weight:700;color:' + C.deep + ';padding:0 0 4px">' + esc_(sec.title) + '</td>' +
    (sec.right ? '<td align="right" style="font-size:12px;color:' + C.muted + ';padding:0 0 4px">' + esc_(sec.right) + '</td>' : '') + '</tr></table>';
  if (sec.off) return html + '<div style="font-style:italic;color:' + C.muted + '">' + esc_(sec.off) + '</div>';
  if (sec.leader) html += '<div style="font-size:13px;font-weight:600;color:' + C.mid + ';margin:0 0 6px">Music Leader: ' + esc_(sec.leader) + '</div>';
  html += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + sec.lines.map((l) => {
    const left = esc_(l.label) + (l.note ? ' <span style="color:' + C.ink + '">· ' + (l.italic ? '<i>' + esc_(l.note) + '</i>' : esc_(l.note)) + '</span>' : '');
    let right = esc_(l.value);
    if (l.song) {
      right = '<b><i>' + (l.song.isNew ? '<span style="font-style:normal;font-size:10px;border:1px solid ' + C.ink + ';border-radius:3px;padding:0 3px;margin-right:4px">NEW</span>' : '') +
        (l.song.num ? '<span style="font-style:normal;font-weight:600;font-size:12px;border:1px solid ' + C.muted + ';border-radius:3px;padding:0 4px;margin-right:5px">' + esc_(l.song.num) + '</span>' : '') +
        esc_(l.song.title) + '</i></b>' + (l.verses ? ' <span style="color:' + C.muted + ';font-size:12px;white-space:nowrap">' + esc_(l.verses) + '</span>' : '');
    }
    let row = '<tr><td valign="top" style="padding:3px 10px 3px 0;color:' + C.muted + '">' + left + '</td><td valign="top" align="right" style="padding:3px 0">' + right + '</td></tr>';
    if (l.arr) {
      row += '<tr><td colspan="2" style="padding:0 0 6px 8px"><div style="border-left:3px solid ' + C.brand + ';padding:2px 0 2px 9px;font-size:13px;color:' + C.ink + '">' +
        esc_(l.arr).replace(/\n/g, '<br>') + '</div></td></tr>';
    }
    return row;
  }).join('') + '</table>';
  if (sec.credits.length) {
    html += '<div style="margin-top:8px;padding-top:6px;border-top:1px solid ' + C.line + ';font-size:12px;color:' + C.muted + '">' +
      sec.credits.map(([h, list]) => '<div><b style="color:' + C.mid + '">' + esc_(h) + ':</b> ' +
        list.map(([k, v]) => esc_(k) + ' ' + '<span style="color:' + C.ink + '">' + esc_(v) + '</span>').join(' · ') + '</div>').join('') + '</div>';
  }
  return html;
}

/** "Piano: Jenn Lambert" with the label in the muted color. */
function labelled_(line) {
  const m = /^([^:]+):\s*(.*)$/.exec(line);
  return m ? '<span style="color:' + EMAIL_COLORS.muted + '">' + esc_(m[1]) + ':</span> ' + esc_(m[2]) : esc_(line);
}

// "43 Rejoice the Lord Is King", "*New* I Set My Hope on Jesus" (same rules as the builder)
function parseSong_(textValue) {
  let t = String(textValue || '').trim();
  const isNew = /^\*?\s*new\s*\*?\s*/i.test(t);
  if (isNew) t = t.replace(/^\*?\s*new\s*\*?\s*/i, '');
  const m = /^(\d{1,4})\s+(.+)$/.exec(t);
  return { isNew, num: m ? m[1] : '', title: m ? m[2] : t };
}
// How the builder files a remembered arrangement: a hymn by number, anything else by title.
function songKey_(value) {
  const s = parseSong_(value);
  if (s.num) return '#' + s.num;
  return s.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** "November 8" */
function longDate_(key) {
  const p = key.split('-').map(Number);
  return MONTH_NAMES[p[1] - 1] + ' ' + p[2];
}

/** The "Notes" bullets for this Sunday, from Service Notes and anything unusual in the saved orders. */
function thisSundayNotes_(sunday, svc, order) {
  const notes = [];
  const parts = [['Sunday AM', ''], ['Sunday PM', 'Sunday evening: ']];
  parts.forEach(([service, prefix]) => {
    const o = order(sunday, service);
    const s = svc(sunday, service);
    const note = (s && valueOf_(s, 'Service Notes')) || (o && o.team && o.team['Service Notes']) || '';
    if (note && CANCELLED.test(note)) {
      const why = note.replace(CANCEL_PREFIX, '').trim();
      notes.push("There's no " + (service === 'Sunday AM' ? 'morning' : 'evening') + ' service this Sunday' + (why ? ' because of ' + why : '') + '.');
      return;
    }
    let supper = false;
    const choirs = {};   // one line per choir, however many times it sings
    if (o) {
      o.items.filter((it) => !it.hidden).forEach((it) => {
        const label = String(it.label || '').trim();
        const value = String(it.value || '').trim();
        const detail = String(it.note || '').trim();
        if (it.kind === 'song') {
          const m = /^\*\s*new\s*\*\s*(.+)$/i.exec(value);
          if (m) notes.push(prefix + 'We\'ll be singing "' + m[1].trim() + '," a new song.');
          return;
        }
        if (USUAL_ITEMS.test(label)) return;
        if (/choir/i.test(label)) {
          const key = label.toLowerCase() + '|' + value.toLowerCase();
          if (!choirs[key]) choirs[key] = { at: notes.push('') - 1, name: /^choir$/i.test(label) ? 'choir' : label, leader: value || CHOIR_LEADER, times: 0, songs: [] };
          choirs[key].times++;
          if (detail) choirs[key].songs.push('"' + detail + '"');
        } else if (/missionary/i.test(label)) {
          notes.push(prefix + (value ? value + ' will give a missionary presentation.' : "We'll have a missionary presentation."));
        } else if (/communion|lord.?s supper/i.test(label)) {
          supper = true;
          notes.push(prefix + "We'll take the Lord's Supper" + (detail ? ' (' + detail + ')' : '') + '.');
        } else if (/baptism/i.test(label)) {
          notes.push(prefix + "We'll have a baptism" + (value ? ' (' + value + ')' : '') + '.');
        } else {
          notes.push(prefix + label + (detail ? ': ' + detail : '') + (value ? ' (' + value + ')' : '') + '.');
        }
      });
    }
    Object.values(choirs).forEach((c) => {
      const what = c.songs.length ? ' ' + listOf_(c.songs) : (c.times > 1 ? ' ' + (TIMES[c.times] || c.times + ' times') : '');
      notes[c.at] = prefix + 'The ' + c.name + ', led by ' + c.leader + ', will sing' + (what.endsWith('"') ? what.slice(0, -1) + '."' : what + '.');
    });
    if (note && !supper) {
      notes.push(/lord.?s supper|communion/i.test(note) ? prefix + "We'll take the Lord's Supper." : (prefix || 'Sunday morning: ') + note + '.');
    }
  });
  return notes.filter((n, i) => n && notes.indexOf(n) === i);   // no line twice
}

const TIMES = { 2: 'twice', 3: 'three times', 4: 'four times' };
const listOf_ = (a) => (a.length < 3 ? a.join(' and ') : a.slice(0, -1).join(', ') + ', and ' + a[a.length - 1]);

/** "Lord's Supper" next to a week's heading, from its Service Notes. */
function aboutService_(s) {
  return s ? valueOf_(s, 'Service Notes') : '';
}

function giftLines_(s) {
  if (!s) return [];
  const out = [];
  if (valueOf_(s, 'Offering')) out.push('Offering: ' + valueOf_(s, 'Offering'));
  if (valueOf_(s, 'Special')) out.push('Special: ' + valueOf_(s, 'Special'));
  return out;
}

function valueOf_(s, role) {
  return ((s.items || []).find((it) => it.role === role) || {}).value || '';
}

// ---------- Helpers ----------

// Right after the Music Schedule script is deployed, Google can answer 404 for a minute,
// so try a few times before giving up.
/** Fetches several feed URLs at the same time; any that fail are tried again. Returns their JSON in order. */
/** GETs or POSTs several requests at once (a URL, or {url, method, payload, ...}), trying again on a hiccup. */
function fetchJsonAll_(urls) {
  const out = urls.map(() => undefined);
  let code = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const todo = urls.map((u, i) => i).filter((i) => out[i] === undefined);
    if (!todo.length) break;
    if (attempt) Utilities.sleep(3000 * attempt);
    const replies = UrlFetchApp.fetchAll(todo.map((i) => Object.assign(
      typeof urls[i] === 'string' ? { url: urls[i] } : urls[i], { muteHttpExceptions: true, followRedirects: true })));
    replies.forEach((res, k) => {
      const c = res.getResponseCode();
      if (c !== 200) { code = c; return; }
      try { out[todo[k]] = JSON.parse(res.getContentText()); } catch (err) { code = 'not JSON'; }
    });
  }
  if (out.some((x) => x === undefined)) {
    throw new Error("The Music Schedule didn't answer (" + code + '). If it was just deployed, wait a minute and try again.');
  }
  return out;
}

/**
 * For each name ("2026-11-01_AM.pdf"), the newest PDF with exactly that name in its month's
 * folder of Orders of Service (2026 / 11_November). Nothing outside that folder is looked at.
 */
function findPdfs_(names) {
  const orders = DriveApp.getFolderById(ORDERS_FOLDER);
  const sub = (folder, name) => {
    const it = folder ? folder.getFoldersByName(name) : null;
    return it && it.hasNext() ? it.next() : null;
  };
  const months = {};   // "2026-11" -> that month's folder, or null
  const best = {};
  names.forEach((name) => {
    const m = /^(\d{4})-(\d{2})-\d{2}_/.exec(name);
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return;
    const key = m[1] + '-' + m[2];
    if (!(key in months)) months[key] = sub(sub(orders, m[1]), m[2] + '_' + MONTH_NAMES[Number(m[2]) - 1]);
    if (!months[key]) return;
    const it = months[key].getFilesByName(name);
    while (it.hasNext()) {
      const f = it.next();
      if (f.isTrashed() || f.getMimeType() !== 'application/pdf') continue;
      if (!best[name] || f.getLastUpdated() > best[name].getLastUpdated()) best[name] = f;
    }
  });
  return best;
}

/** Drafts with exactly this subject, each with remove(). Asks Gmail for just those drafts instead of opening every one. */
function existingDrafts_(subject) {
  try {
    const list = Gmail.Users.Drafts.list('me', { q: 'in:drafts subject:"Upcoming Assignments"', maxResults: 50 }).drafts || [];
    return list.filter((d) => {
      const full = Gmail.Users.Drafts.get('me', d.id, { format: 'metadata', metadataHeaders: ['Subject'] });
      const h = ((full.message.payload || {}).headers || []).find((x) => x.name === 'Subject');
      return h && h.value === subject;
    }).map((d) => ({ remove: () => Gmail.Users.Drafts.remove('me', d.id) }));
  } catch (err) {   // if the Gmail service isn't available, fall back to the slow way
    return GmailApp.getDrafts().filter((d) => d.getMessage().getSubject() === subject)
      .map((d) => ({ remove: () => d.deleteDraft() }));
  }
}

function readLists_() {
  const id = PropertiesService.getScriptProperties().getProperty(LISTS_PROP);
  if (!id) throw new Error('Run setupEmailHelper first.');
  const values = SpreadsheetApp.openById(id).getSheets()[0].getDataRange().getValues().slice(1);
  const col = (c) => values.map((r) => String(r[c] || '').trim()).filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
  return [col(0), col(1)];
}

/** The two BCC lists from the most recent song email in Sent mail (sent as two messages a moment apart). */
function listsFromSentMail_() {
  const msgs = [];
  GmailApp.search(SENT_SEARCH, 0, 10).forEach((t) => t.getMessages().forEach((m) => {
    if (m.getBcc()) msgs.push(m);
  }));
  msgs.sort((a, b) => b.getDate() - a.getDate());
  if (!msgs.length) return [[], []];
  const latest = msgs[0].getDate().getTime();
  const batch = msgs.filter((m) => latest - m.getDate().getTime() < 10 * 60 * 1000).slice(0, 2);
  const split = (m) => m.getBcc().split(',').map((s) => s.replace(/.*</, '').replace(/>.*/, '').trim()).filter(Boolean);
  return [split(batch[0]), batch[1] ? split(batch[1]) : []];
}

/** The Gmail signature (with the logo), or nothing if Gmail won't share it. */
function signature_() {
  try {
    const sendAs = Gmail.Users.Settings.SendAs.list('me').sendAs || [];
    const main = sendAs.find((s) => s.isDefault) || sendAs[0];
    return main && main.signature ? '<div>--</div>' + main.signature : '';
  } catch (err) {
    return '';
  }
}

function subjectFor_(sunday) {
  return "Sunday's Services (" + shortDate_(sunday) + ') & Upcoming Assignments';
}

/** The coming Sunday as "YYYY-MM-DD" (next week's, if today is Sunday). */
function comingSunday_() {
  const d = new Date();
  d.setDate(d.getDate() + (d.getDay() === 0 ? 7 : 7 - d.getDay()));
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function addDays_(key, n) {
  const p = key.split('-').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2] + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function shortDate_(key) {
  const p = key.split('-').map(Number);
  return p[1] + '/' + p[2];
}

function esc_(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
