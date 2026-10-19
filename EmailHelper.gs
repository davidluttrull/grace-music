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
 *   feed (the same one the volunteer page and builder read).
 * - The PDFs: "YYYY-MM-DD_Order of Service.pdf" and "YYYY-MM-DD_AM.pdf" in the
 *   Orders of Service folder, shared from the school Drive with this account.
 * - The recipients: the "Song Email Lists" sheet that setupEmailHelper makes
 *   in this account's Drive, filled from the last song email in Sent mail.
 */

const FEED_URL = 'https://script.google.com/macros/s/AKfycbyN_FOd4twDKmMrDk5l3NqTmKRJrKhIC3kUgkuumCKGoxK_wlkFxZlWevtGUyPtSnPE8Q/exec';
const LISTS_PROP = 'LISTS_SHEET_ID';
const KEY_PROP = 'HELPER_KEY';
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
    return page("That link isn't right", '<p>Run <b>builderLink</b> in the email helper project and paste the new link into the builder.</p>');
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
  const [feed, orders] = fetchJsonAll_([FEED_URL, FEED_URL + '?orders=1']);   // both at once
  if (feed.status === 'error') throw new Error(feed.message);
  const email = buildEmail_(sunday, feed.services || [], orders.orders || {});
  const found = findPdfs_(email.attachments);
  const files = email.attachments.map((name) => ({ name, file: found[name] || null }));
  const blobs = files.filter((f) => f.file).map((f) => f.file.getBlob().setName(f.name));
  const missing = files.filter((f) => !f.file).map((f) => f.name);
  const lists = readLists_().filter((l) => l.length);
  if (!lists.length) throw new Error('The "Song Email Lists" sheet has no addresses.');

  const old = existingDrafts_(email.subject);
  if (old.length && !replace) return { email, made: 0, kept: old.length, missing, lists };
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
  return { email, made: lists.length, kept: 0, missing, lists };
}

function summary_(res) {
  const lines = [];
  if (res.made) lines.push('Made ' + res.made + ' drafts of "' + res.email.subject + '" (' + res.lists.map((l) => l.length).join(' + ') + ' people).');
  else lines.push('Drafts of "' + res.email.subject + '" were already made, so they were left alone.');
  if (res.missing.length) lines.push('Not attached (not in the Orders of Service folder yet): ' + res.missing.join(', ') + '.');
  else lines.push('Attached: ' + res.email.attachments.join(', ') + '.');
  return lines.join('\n');
}

/**
 * The email for the Sunday `sunday` ("2026-10-18"), from the schedule feed and
 * the saved orders. Returns { subject, text, html, attachments } where
 * attachments are the PDF names to look for.
 */
function buildEmail_(sunday, services, orders) {
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
  const attachSentence = 'Attached is the order of service for this Sunday and the song scans for the next two Sundays.';

  // Plain text
  let text = greeting + '\n\n' + intro + ' ' + attachSentence + '\n\nNotes:\n' +
    notes.map((n) => '- ' + n).join('\n') + '\n\nI think that covers everything!\n';
  blocks.forEach((b) => {
    text += '\n' + b.title + (b.extra ? ' - ' + b.extra : '') + '\n';
    if (!b.lines.length && !b.gift.length) { text += 'TBA\n'; return; }
    if (b.lines.length) text += b.lines.join('\n') + '\n' + (b.gift.length ? '\n' : '');
    if (b.gift.length) text += b.gift.join('\n') + '\n';
  });

  // HTML, laid out like the emails David writes by hand
  const div = (s) => '<div>' + s + '</div>';
  let html = div(esc_(greeting)) + div(esc_(intro) + ' ' + esc_(attachSentence)) + '<br>' + div('Notes:') +
    '<ul>' + notes.map((n) => '<li>' + esc_(n) + '</li>').join('') + '</ul>' + div('I think that covers everything!');
  blocks.forEach((b) => {
    html += '<br>' + div('<b>' + esc_(b.title) + '</b>' + (b.extra ? ' – ' + esc_(b.extra) : ''));
    if (!b.lines.length && !b.gift.length) { html += div('TBA'); return; }
    html += b.lines.map((l) => div(esc_(l))).join('');
    if (b.lines.length && b.gift.length) html += '<br>';
    html += b.gift.map((l) => div(esc_(l))).join('');
  });
  html += '<br>';

  return {
    subject: subjectFor_(sunday),
    text,
    html,
    attachments: [sunday + '_Order of Service.pdf', sunday + '_AM.pdf', week[1] + '_AM.pdf'],
  };
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
          notes.push(prefix + 'The choir, led by ' + (value || CHOIR_LEADER) + ', will sing' + (detail ? ' "' + detail + '."' : '.'));
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
    if (note && !supper) {
      notes.push(/lord.?s supper|communion/i.test(note) ? prefix + "We'll take the Lord's Supper." : (prefix || 'Sunday morning: ') + note + '.');
    }
  });
  return notes;
}

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
function fetchJsonAll_(urls) {
  const out = urls.map(() => undefined);
  let code = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const todo = urls.map((u, i) => i).filter((i) => out[i] === undefined);
    if (!todo.length) break;
    if (attempt) Utilities.sleep(3000 * attempt);
    const replies = UrlFetchApp.fetchAll(todo.map((i) => ({ url: urls[i], muteHttpExceptions: true, followRedirects: true })));
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

/** For each name, the newest PDF with exactly that name this account can see (the shared Orders of Service folder), in one Drive search. */
function findPdfs_(names) {
  const quoted = names.map((n) => 'title = "' + n.replace(/"/g, '\\"') + '"');
  const it = DriveApp.searchFiles('trashed = false and (' + quoted.join(' or ') + ')');
  const best = {};
  while (it.hasNext()) {
    const f = it.next();
    const name = f.getName();
    if (f.getMimeType() !== 'application/pdf' || names.indexOf(name) < 0) continue;
    if (!best[name] || f.getLastUpdated() > best[name].getLastUpdated()) best[name] = f;
  }
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
