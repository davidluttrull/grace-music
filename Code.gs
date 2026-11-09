/**
 * Grace Baptist Church - Music Schedule
 *
 * Back end for the volunteers' schedule page (index.html, hosted on GitHub
 * Pages). doGet reads every month tab in this spreadsheet and returns the
 * upcoming services as JSON, plus the regular rotation from the Rotation
 * tab's table (not the notes under it). It never reads the Away tab, so who's
 * out of town stays private.
 * See SETUP.md for how to deploy it.
 *
 * A month tab is any tab whose A1 says "Month". Inside it, each service block
 * starts with a header row: the service's name in column A, nothing in B, and
 * dates in C:G. A "Week" row may follow, then one row per role until a blank
 * row. The regular services are in SERVICES; any other name in column A
 * (such as "Christmas Eve") is a one-time service with its date typed in C.
 *
 * doPost handles the page's "I'll be out" button: it adds a row to the Away
 * tab (which turns that person's cells red for that one service) and emails
 * the script's owner. Undo removes the row again.
 *
 * The order of service builder (builder.html) reads saved orders with
 * doGet?orders=1 and saves them with doPost. Saving needs the ORDER_CODE
 * script property, which setupOrderCode creates. The public doGet?orders=1
 * leaves out each order's team email notes (order.email); doPost
 * {action: 'orders', code} returns them, for the builder and the email
 * helper. Orders live on the Orders tab, one row per service
 * ("2026-11-01|Sunday AM") or default ("template|Sunday AM"), as JSON. The
 * builder's Cancelled switch writes a service's Service Notes cell (setNote),
 * with the same code.
 *
 * The schedule editor (edit.html) is for changes from a phone. With the same
 * code, doPost {action: 'editData'} returns every role row of the upcoming
 * services (blank ones too), whether each cell still has its rotation
 * formula, who's on the Away tab, and name and song suggestions;
 * {action: 'setCell'} writes one cell, or puts its rotation formula back.
 *
 * It also adds a Music Schedule menu to the Sheet: one item puts the rotation
 * formulas back in selected cells, another builds the next month's tab, and
 * "Update song list" fills the Song Log from the month tabs' song rows.
 *
 * The Songs tab lists every congregational song with its last date (newest in
 * the Song Log, scheduled dates included) and times sung in the last 12
 * months; both are formulas reading the Song Log. sortSongs_ keeps the tab in
 * five sections (Hymns by number, Majesty Hymnal by number, Modern Songs A-Z,
 * Christmas, Removed) and runs when a Category or Removed cell changes, or a
 * "Majesty ###" note is typed or cleared. updateSongList runs every
 * night once setupSongList has been run.
 *
 * The song packet page (packet.html) uses doPost with the same code to read
 * the Song PDFs folder in Drive (every subfolder), send it one PDF at a time,
 * keep a PDF uploaded from the page (in Song PDFs / Added from the packet
 * page), and save the finished packet as "2026-11-01_AM.pdf" in that month's
 * Orders of Service folder. It remembers which PDF was picked for each song.
 */

const SERVICES = ['Sunday AM', 'Sunday PM', 'Wednesday'];  // repeat every month
const FIRST_DATE_COL = 3; // column C
const DATE_COLS = 5;      // C:G, up to five weeks
const DAYS_BACK = 1;      // keep yesterday's services so Sunday night still shows Sunday

const AWAY_SHEET = 'Away';
const ROTATION_SHEET = 'Rotation';
const PAGE_NOTE = 'Volunteer page';  // Note column prefix on rows the page adds, so Undo only removes those
const MAX_POSTS = 40;                // "I'll be out" requests allowed per 10 minutes, across all phones
const SERVICE_LABEL = { 'Sunday AM': 'Sunday Morning', 'Sunday PM': 'Sunday Evening', 'Wednesday': 'Wednesday Evening' };

const ORDERS_SHEET = 'Orders';
const ORDER_DAYS_BACK = 14;          // saved orders sent to the builder: two weeks back and everything ahead
const MAX_ORDER_CHARS = 40000;       // one order's JSON; a busy service is well under 10,000
const MAX_BAD_CODES = 20;            // wrong order codes allowed per 10 minutes
const NOTES_ROLE = 'Service Notes';  // column B of the row the builder's Cancelled switch writes

const SONGS_SHEET = 'Songs';
const SONG_LOG_SHEET = 'Song Log';
const SONG_SECTION = 'Songs';        // the month tabs' section with Song 1-5 and Closing
// Songs tab columns: # | Song | Last Sung | 12 mo | Category | Notes | Removed | Other names | ID.
// Last Sung and 12 mo are array formulas in row 1, so the script never writes C or D.
const SONG_COLS = 9;
const SONG_HEADINGS = ['Hymns', 'Majesty Hymnal', 'Modern Songs', 'Christmas', 'Removed'];
// A song with no Rejoice number whose note starts "Majesty 345" is in the Majesty hymnal.
const MAJESTY_NOTE = /^\s*Majesty\s+(\d+)/i;
const NEW_SONGS_LABEL = 'Add new songs below this line';
const NEW_SONG_ROWS = 5;
const CANCELLED_NOTE = /cancel|^\s*no\b.*\bservice/i;

// Song packets (packet.html)
const SONG_PDFS_FOLDER = '0B_yrCm_KORazSnUtd0Qza1JBOE0';  // Drive: Song PDFs; every subfolder is read
const ORDERS_FOLDER = '0B_yrCm_KORazWDBYMUdXX1RrT1E';     // Drive: Orders of Service, with 2026 / 11_November folders
const UPLOADS_FOLDER = 'Added from the packet page';      // inside Song PDFs
const PACKET_SUFFIX = { 'Sunday AM': 'AM', 'Sunday PM': 'PM', 'Wednesday': 'Wed' };
const PDF_INDEX_KEY = 'pdfIndex';                          // the folder listing, kept in the script cache
const PDF_INDEX_SECONDS = 6 * 60 * 60;
const MAX_PDF_BYTES = 15 * 1024 * 1024;                    // the whole-hymnal PDFs are left out
const MAX_PACKET_BYTES = 40 * 1024 * 1024;
const PACKET_DAYS_KEPT = 120;                              // what was in each packet, for reopening it
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** GET: upcoming services, oldest first. With ?orders=1, the saved orders of service instead. */
function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.orders) return json_(savedOrders_(false));
    return json_({ services: upcomingServices_(), rotation: rotation_(), updated: new Date().toISOString() });
  } catch (err) {
    return json_({ status: 'error', message: 'The schedule couldn’t be read. ' + err.message });
  }
}

function upcomingServices_() {
  const tz = Session.getScriptTimeZone();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DAYS_BACK);
  const fromKey = Utilities.formatDate(cutoff, tz, 'yyyy-MM-dd');

  const byKey = {};
  SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach((sheet) => {
    if (sheet.getRange('A1').getDisplayValue().trim() !== 'Month') return;
    readMonth_(sheet, tz).forEach((svc) => {
      if (svc.date >= fromKey) byKey[svc.date + '|' + svc.service] = svc;
    });
  });

  const order = (s) => SERVICES.indexOf(s);
  return Object.keys(byKey).map((k) => byKey[k])
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : order(a.service) - order(b.service)));
}

/** All service blocks on one month tab. */
function readMonth_(sheet, tz) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const width = FIRST_DATE_COL - 1 + DATE_COLS;
  const range = sheet.getRange(1, 1, last, width);
  const values = range.getValues();
  const shown = range.getDisplayValues();
  const out = [];

  let r = 0;
  while (r < values.length) {
    const service = String(shown[r][0]).trim();
    if (!isHeader_(shown[r], values[r])) { r++; continue; }

    // Header row: dates in C:G (the 5th is blank in a four-week month).
    const cols = [];
    for (let c = 0; c < DATE_COLS; c++) {
      const v = values[r][FIRST_DATE_COL - 1 + c];
      if (v instanceof Date) cols.push({ c: FIRST_DATE_COL - 1 + c, date: Utilities.formatDate(v, tz, 'yyyy-MM-dd') });
    }
    r++;
    if (r < values.length && String(shown[r][1]).trim() === 'Week') r++;

    // Role rows until the first blank row. Merged section labels show only on
    // their first row, so carry the last one down.
    const rows = [];
    let section = '';
    for (; r < values.length; r++) {
      const sec = String(shown[r][0]).trim();
      const role = String(shown[r][1]).trim();
      if (!sec && !role) break;
      if (isHeader_(shown[r], values[r])) break;
      if (sec) section = sec;
      rows.push({ r: r, section: section, role: role });
    }

    cols.forEach((col) => {
      const items = [];
      rows.forEach((row) => {
        const value = String(shown[row.r][col.c]).trim();
        if (value) items.push({ section: row.section, role: row.role, value: value });
      });
      out.push({ date: col.date, service: service, items: items });
    });
  }
  return out;
}

/**
 * The Rotation tab's table (Service, Section, Role, Week 1-5), down to the
 * first row with no service, so the notes under it stay in the Sheet.
 */
function rotation_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ROTATION_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3 + DATE_COLS).getDisplayValues();
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const [service, section, role] = rows[i].slice(0, 3).map((v) => String(v).trim());
    if (!service) break;
    if (role) out.push({ service, section, role, weeks: rows[i].slice(3).map((v) => String(v).trim()) });
  }
  return out;
}

/**
 * The sub lists typed under the Rotation table, one per line as "Label: name, name & name Surname", e.g.
 * "Backup singers (call for last-minute fills): Carrie Warner, Amber Foote". "Seth & Kendall Plew" becomes
 * Seth Plew and Kendall Plew. Lines without a colon, or with nothing that looks like a name, are skipped.
 */
function rotationSubs_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ROTATION_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const lines = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues().map((r) => String(r[0]).trim());
  const end = lines.indexOf('');
  if (end < 0) return [];
  const looksLikeName = /^[A-Z][\w'\u2019.-]*(\s+[A-Z][\w'\u2019.-]*){0,3}$/;
  const out = [];
  lines.slice(end).forEach((line) => {
    const colon = line.indexOf(':');
    if (colon < 1) return;
    const label = line.slice(0, colon).replace(/\(.*?\)/g, '').trim();
    const names = [];
    line.slice(colon + 1).split(/\s*[,;]\s*/).forEach((part) => {
      const pieces = part.split(/\s*(?:&|\/|\band\b)\s*/).map((p) => p.trim().replace(/\.$/, '')).filter(Boolean);
      const last = pieces.length ? pieces[pieces.length - 1].split(/\s+/) : [];
      const surname = last.length > 1 ? last[last.length - 1] : '';
      pieces.forEach((p) => {
        const name = surname && !/\s/.test(p) ? p + ' ' + surname : p;
        if (looksLikeName.test(name) && names.indexOf(name) < 0) names.push(name);
      });
    });
    if (label && names.length) out.push({ label, names });
  });
  return out;
}

/** A service block's first row: a name in A, nothing in B, a date in C. */
function isHeader_(shownRow, valueRow) {
  return String(shownRow[0]).trim() !== '' && String(shownRow[1]).trim() === '' &&
    valueRow[FIRST_DATE_COL - 1] instanceof Date;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- "I'll be out" from the page ----------

/**
 * POST from the page, body {action: 'out' | 'undo', name, date, service, matches}.
 * `matches` are the volunteer's name as it's written in that service's cells
 * ("E Foote"), so the Away tab's red highlight finds them. The page sends it as
 * plain text with no Google login, like the attendance page.
 */
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ status: 'error', message: 'That request didn’t make sense. Reload the page and try again.' });
  }
  try {
    if (body && body.action === 'orders') return json_(privateOrders_(body));
    if (body && body.action === 'saveOrder') return json_(saveOrder_(body));
    if (body && body.action === 'setNote') return json_(setServiceNote_(body));
    if (body && body.action === 'editData') return json_(editData_(body));
    if (body && body.action === 'setCell') return json_(setCell_(body));
    if (body && body.action === 'packetSetup') return json_(packetSetup_(body));
    if (body && body.action === 'pdfFile') return json_(pdfFile_(body));
    if (body && body.action === 'uploadPdf') return json_(uploadPdf_(body));
    if (body && body.action === 'savePacket') return json_(savePacket_(body));
    if (body && body.action === 'saveOrderPdf') return json_(saveOrderPdf_(body));
    if (body && body.action === 'team') return json_(teamFeed_(body));
    if (body && body.action === 'teamFile') return json_(teamFile_(body));
    if (body && body.action === 'teamSongs') return json_(teamSongs_(body));
    if (!underRateLimit_()) {
      return json_({ status: 'error', message: 'The schedule is busy right now. Try again in a few minutes.' });
    }
    const req = checkRequest_(body);
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      return json_(req.action === 'undo' ? undoOut_(req) : markOut_(req));
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ status: 'error', message: err.message });
  }
}

function checkRequest_(body) {
  const action = body && body.action;
  if (action !== 'out' && action !== 'undo') throw new Error('Unknown request. Reload the page and try again.');
  const name = clean_(body.name);
  if (name.length < 2) throw new Error('Type your name at the top of the page first.');
  const date = String(body.date || '');
  const service = String(body.service || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !service || service.length > 60) {
    throw new Error('That service isn’t on the schedule. Reload the page.');
  }
  const asked = (Array.isArray(body.matches) ? body.matches : []).map(clean_).filter(Boolean).slice(0, 6)
    .filter((m, i, all) => all.indexOf(m) === i);
  if (!asked.length) throw new Error('Your name isn’t on that service. Reload the page.');
  if (action === 'undo') return { action, name, date, service, matches: asked, roles: [] };

  // Only names that really appear in that service, so the page can't be used
  // to put anything else on the Away tab.
  const svc = upcomingServices_().find((s) => s.date === date && s.service === service);
  if (!svc) throw new Error('That service isn’t on the schedule anymore. Reload the page.');
  const has = (value, m) => value.toLowerCase().indexOf(m.toLowerCase()) >= 0;
  const matches = asked.filter((m) => svc.items.some((it) => has(it.value, m)));
  if (!matches.length) throw new Error('Your name isn’t on that service anymore. Reload the page.');
  const roles = svc.items.filter((it) => matches.some((m) => has(it.value, m))).map((it) => it.role);
  return { action, name, date, service, matches, roles };
}

function markOut_(req) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = awaySheet_(ss);
  const col = awayColumns_(sheet);
  const tz = ss.getSpreadsheetTimeZone();
  const already = awayRowsFor_(sheet, col, req, tz).map((r) => r.name);
  const [y, m, d] = req.date.split('-').map(Number);
  const note = PAGE_NOTE + ': ' + req.name + ' (' + req.roles.join(', ') + '), ' +
    Utilities.formatDate(new Date(), tz, 'MMM d, h:mm a');

  req.matches.forEach((match) => {
    if (already.indexOf(match.toLowerCase()) >= 0) return;
    const row = new Array(sheet.getLastColumn()).fill('');
    row[col.Name - 1] = match;
    row[col.From - 1] = '=DATE(' + y + ',' + m + ',' + d + ')';
    row[col.Service - 1] = req.service;
    row[col.Note - 1] = note;
    sheet.appendRow(row);
  });

  const emailed = notify_('Out: ' + req.name + ', ' + serviceLabel_(req, tz), [
    req.name + ' says they’ll be out for ' + serviceLabel_(req, tz) + '.',
    'Scheduled for: ' + req.roles.join(', '),
    '',
    'Their name is red on the schedule now. To undo it, delete their row on the Away tab:',
    ss.getUrl(),
  ].join('\n'));
  return { status: 'ok', out: true, emailed: emailed };
}

function undoOut_(req) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = awaySheet_(ss);
  const col = awayColumns_(sheet);
  const tz = ss.getSpreadsheetTimeZone();
  const rows = awayRowsFor_(sheet, col, req, tz).filter((r) => r.fromPage);
  rows.sort((a, b) => b.row - a.row).forEach((r) => sheet.deleteRow(r.row));

  const emailed = rows.length > 0 && notify_('Back in: ' + req.name + ', ' + serviceLabel_(req, tz), [
    req.name + ' undid their "I’ll be out" for ' + serviceLabel_(req, tz) + '.',
    'Their name is back to normal on the schedule.',
    '',
    ss.getUrl(),
  ].join('\n'));
  return { status: 'ok', out: false, removed: rows.length, emailed: emailed };
}

function awaySheet_(ss) {
  const sheet = ss.getSheetByName(AWAY_SHEET);
  if (!sheet) throw new Error('The schedule is missing its Away tab. Let the music office know.');
  return sheet;
}

/** Column numbers on the Away tab, found by header name. */
function awayColumns_(sheet) {
  const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map((h) => String(h).trim());
  const col = {};
  ['Name', 'From', 'To', 'Service', 'Note'].forEach((h) => {
    const i = head.indexOf(h);
    if (i < 0) throw new Error('The Away tab is missing its ' + h + ' column. Let the music office know.');
    col[h] = i + 1;
  });
  return col;
}

/** Away rows for this date, service and any of the request's names. */
function awayRowsFor_(sheet, col, req, tz) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const want = req.matches.map((m) => m.toLowerCase());
  const out = [];
  sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues().forEach((v, i) => {
    const from = v[col.From - 1];
    if (!(from instanceof Date) || Utilities.formatDate(from, tz, 'yyyy-MM-dd') !== req.date) return;
    if (String(v[col.Service - 1]).trim() !== req.service) return;
    const name = String(v[col.Name - 1]).trim().toLowerCase();
    if (want.indexOf(name) < 0) return;
    out.push({ row: i + 2, name: name, fromPage: String(v[col.Note - 1]).indexOf(PAGE_NOTE) === 0 });
  });
  return out;
}

function serviceLabel_(req, tz) {
  const [y, m, d] = req.date.split('-').map(Number);
  return (SERVICE_LABEL[req.service] || req.service) + ', ' + Utilities.formatDate(new Date(y, m - 1, d, 12), tz, 'EEE MMM d');
}

/**
 * Emails the script's owner, or the address in the NOTIFY_EMAIL script
 * property if there is one. A failed email doesn't fail the request.
 */
function notify_(subject, body) {
  try {
    const to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL') ||
      Session.getEffectiveUser().getEmail();
    if (!to) return false;
    MailApp.sendEmail(to, subject, body, { name: 'Music Schedule' });
    return true;
  } catch (err) {
    console.error('Email failed: ' + err);
    return false;
  }
}

/** Run once from the editor so Google asks for permission to send email. */
function sendTestEmail() {
  const ok = notify_('Music Schedule test', 'Emails from the volunteer page’s "I’ll be out" button will come here.');
  console.log(ok ? 'Test email sent.' : 'The test email didn’t send. Check the log above.');
}

function underRateLimit_() {
  const cache = CacheService.getScriptCache();
  const count = Number(cache.get('posts') || 0);
  if (count >= MAX_POSTS) return false;
  cache.put('posts', String(count + 1), 600);
  return true;
}

function clean_(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 60);
}

// ---------- Orders of service ----------

/**
 * Saved orders from two weeks back on, and the default orders, keyed like the Orders tab.
 * The team email notes (order.email) are personal, so they're only included with the
 * order code (withEmail); the public feed says emailHidden instead.
 */
function savedOrders_(withEmail) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORDERS_SHEET);
  const out = { orders: {}, templates: {} };
  if (!withEmail) out.emailHidden = true;
  if (!sheet || sheet.getLastRow() < 2) return out;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ORDER_DAYS_BACK);
  const fromKey = Utilities.formatDate(cutoff, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues().forEach((row) => {
    const key = String(row[0]);
    let order;
    try { order = JSON.parse(row[2]); } catch (err) { return; }
    if (!withEmail && order) delete order.email;
    if (key.indexOf('template|') === 0) out.templates[key.slice(9)] = order;
    else if (key.slice(0, 10) >= fromKey) out.orders[key] = order;
  });
  return out;
}

/** POST {action: 'orders', code}: the saved orders with their team email notes. */
function privateOrders_(body) {
  const refused = checkOrderCode_(body.code);
  if (refused) return refused;
  return savedOrders_(true);
}

/**
 * POST {action: 'saveOrder', code, key, order}. A null order deletes the saved one.
 * An order sent without an email field keeps the saved one's team email notes, so a
 * builder that loaded the public feed (which leaves them out) can't erase them.
 */
function saveOrder_(body) {
  const refused = checkOrderCode_(body.code);
  if (refused) return refused;
  const key = String(body.key || '');
  if (!/^(\d{4}-\d{2}-\d{2}|template)\|[^|]{1,60}$/.test(key)) throw new Error('That order can’t be saved. Reload the page and try again.');
  if (body.order != null && JSON.stringify(body.order).length > MAX_ORDER_CHARS) throw new Error('That order is too long to save.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(ORDERS_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(ORDERS_SHEET);
      sheet.appendRow(['Key', 'Saved', 'Order (saved by the builder; don’t edit)']);
      sheet.setFrozenRows(1);
      sheet.getRange('A1:C1').setFontWeight('bold');
    }
    const last = sheet.getLastRow();
    const keys = last > 1 ? sheet.getRange(2, 1, last - 1, 1).getValues().map((r) => String(r[0])) : [];
    const i = keys.indexOf(key);
    const order = body.order;
    if (order != null && order.email === undefined && i >= 0) {
      try {
        const before = JSON.parse(sheet.getRange(i + 2, 3).getValue());
        if (before && before.email) order.email = before.email;
      } catch (err) { /* nothing to keep */ }
    }
    const json = order == null ? '' : JSON.stringify(order);
    if (!json) {
      if (i >= 0) sheet.deleteRow(i + 2);
    } else if (i >= 0) {
      sheet.getRange(i + 2, 2, 1, 2).setValues([[new Date(), json]]);
    } else {
      sheet.appendRow([key, new Date(), json]);
    }
  } finally {
    lock.releaseLock();
  }
  return { status: 'ok', saved: new Date().toISOString() };
}

/**
 * POST {action: 'setNote', code, date, service, note}: writes one service's
 * Service Notes cell, such as "No Service – Thanksgiving Dinner". A blank note
 * clears it. The Sheet's cancelled colors follow the note on their own.
 */
function setServiceNote_(body) {
  const refused = checkOrderCode_(body.code);
  if (refused) return refused;
  const date = String(body.date || '');
  const service = String(body.service || '');
  let note = String(body.note == null ? '' : body.note).replace(/\s+/g, ' ').trim().slice(0, 200);
  if (/^[=+\-@]/.test(note)) note = "'" + note;   // never a formula
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || SERVICES.indexOf(service) < 0) {
    throw new Error('That service can’t be changed. Reload the page and try again.');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const cell = serviceCell_(date, service, NOTES_ROLE);
    if (!cell) throw new Error('There’s no Service Notes row for ' + SERVICE_LABEL[service] + ' on ' + date + ' in the Sheet.');
    cell.setValue(note);
  } finally {
    lock.releaseLock();
  }
  return { status: 'ok', note: note };
}

/** The cell for one role of one service on one date, or null if the Sheet doesn't have it. */
function serviceCell_(date, service, role) {
  const tz = Session.getScriptTimeZone();
  const width = FIRST_DATE_COL - 1 + DATE_COLS;
  const sheets = monthSheets_(SpreadsheetApp.getActiveSpreadsheet());
  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    const last = sheet.getLastRow();
    if (last < 2) continue;
    const range = sheet.getRange(1, 1, last, width);
    const values = range.getValues();
    const shown = range.getDisplayValues();
    for (let r = 0; r < values.length; r++) {
      if (!isHeader_(shown[r], values[r]) || String(shown[r][0]).trim() !== service) continue;
      let col = -1;
      for (let c = FIRST_DATE_COL - 1; c < width; c++) {
        const v = values[r][c];
        if (v instanceof Date && Utilities.formatDate(v, tz, 'yyyy-MM-dd') === date) col = c;
      }
      if (col < 0) continue;
      for (let k = r + 1; k < values.length; k++) {
        const a = String(shown[k][0]).trim();
        const b = String(shown[k][1]).trim();
        if ((!a && !b) || isHeader_(shown[k], values[k])) break;
        if (b === role) return sheet.getRange(k + 1, col + 1);
      }
    }
  }
  return null;
}

// ---------- Schedule editor (edit.html) ----------

/**
 * Every role row of the upcoming services, for the editor: { services: [{ date, service, rows: [{ section,
 * role, value, rot, reset }] }], people, songs, away }. rot: the cell still has its rotation formula;
 * reset: it was typed over and the rotation can be put back. away: "date|service" -> names on the Away tab.
 */
function editData_(body) {
  const refused = checkOrderCode_(body.code);
  if (refused) return refused;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = Session.getScriptTimeZone();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DAYS_BACK);
  const fromKey = Utilities.formatDate(cutoff, tz, 'yyyy-MM-dd');
  const sheets = monthSheets_(ss);
  const rotation = sheets.length ? rotationFormulas_(ss, sheets[0]) : {};
  const width = FIRST_DATE_COL - 1 + DATE_COLS;
  const people = {};
  const addPerson = (v) => {
    v = String(v || '').trim();
    if (!v) return;
    people[v] = true;
    v.split(/\s*(?:&|,|\/|\band\b)\s*/).forEach((n) => { if (n.trim()) people[n.trim()] = true; });
  };
  const table = rotation_();
  const subs = rotationSubs_();
  table.forEach((r) => r.weeks.forEach(addPerson));
  subs.forEach((s) => s.names.forEach(addPerson));

  const byKey = {};
  sheets.forEach((sheet) => {
    const last = sheet.getLastRow();
    if (last < 2) return;
    const range = sheet.getRange(1, 1, last, width);
    const values = range.getValues();
    const shown = range.getDisplayValues();
    const formulas = range.getFormulasR1C1();
    for (let r = 0; r < values.length; r++) {
      if (!isHeader_(shown[r], values[r])) continue;
      const service = String(shown[r][0]).trim();
      const cols = [];
      for (let c = FIRST_DATE_COL - 1; c < width; c++) {
        const v = values[r][c];
        if (v instanceof Date) cols.push({ c, date: Utilities.formatDate(v, tz, 'yyyy-MM-dd') });
      }
      const rows = [];
      let section = '';
      for (let k = r + 1; k < values.length; k++) {
        const a = String(shown[k][0]).trim();
        const b = String(shown[k][1]).trim();
        if ((!a && !b) || isHeader_(shown[k], values[k])) break;
        if (a) section = a;
        if (b && b !== 'Week') rows.push({ k, section, role: b });
      }
      cols.forEach((col) => {
        const out = rows.map((row) => {
          const value = String(shown[row.k][col.c]).trim();
          const rot = !!formulas[row.k][col.c];
          if (row.section !== SONG_SECTION && row.role !== NOTES_ROLE) addPerson(value);
          return { section: row.section, role: row.role, value, rot, reset: !rot && !!rotation[service + '|' + row.role] };
        });
        if (col.date >= fromKey) byKey[col.date + '|' + service] = { date: col.date, service, rows: out };
      });
    }
  });
  const order = (x) => (SERVICES.indexOf(x) < 0 ? SERVICES.length : SERVICES.indexOf(x));
  const services = Object.keys(byKey).map((k) => byKey[k])
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : order(a.service) - order(b.service)));

  const songsSheet = ss.getSheetByName(SONGS_SHEET);
  const songs = songsSheet ? readSongs_(songsSheet).filter((x) => !x.removed && x.title)
    .map((x) => (x.num ? x.num + ' ' + x.title : x.title)) : [];

  return { status: 'ok', services, songs, people: Object.keys(people).sort(), away: awayByService_(ss, services, tz), rotation: table, subs };
}

/** "2026-11-08|Sunday AM" -> names on the Away tab for that service (a blank Service means every service that day). */
function awayByService_(ss, services, tz) {
  const out = {};
  const sheet = ss.getSheetByName(AWAY_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return out;
  let col;
  try { col = awayColumns_(sheet); } catch (err) { return out; }
  const day = (v) => (v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : '');
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues().map((v) => ({
    name: String(v[col.Name - 1]).trim(), from: day(v[col.From - 1]), to: day(v[col.To - 1]), service: String(v[col.Service - 1]).trim(),
  })).filter((a) => a.name && a.from);
  services.forEach((svc) => {
    const names = rows.filter((a) => svc.date >= a.from && svc.date <= (a.to || a.from) && (!a.service || a.service === svc.service))
      .map((a) => a.name);
    if (names.length) out[svc.date + '|' + svc.service] = names;
  });
  return out;
}

/**
 * Writes one cell from the editor: { date, service, role, value, was, reset }. If the cell no longer shows
 * `was` (someone changed it in the Sheet meanwhile), nothing is written and the current value comes back.
 * reset puts the row's rotation formula back instead.
 */
function setCell_(body) {
  const refused = checkOrderCode_(body.code);
  if (refused) return refused;
  const date = String(body.date || '');
  const service = String(body.service || '').trim();
  const role = String(body.role || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !service || service.length > 60 || !role || role.length > 60) {
    throw new Error('That spot can’t be changed. Reload the page and try again.');
  }
  let value = String(body.value == null ? '' : body.value).replace(/\s+/g, ' ').trim().slice(0, 200);
  if (/^[=+\-@]/.test(value)) value = "'" + value;   // never a formula
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const cell = serviceCell_(date, service, role);
    if (!cell) throw new Error('The Sheet doesn’t have ' + role + ' for ' + service + ' on ' + date + ' anymore. Reload the page.');
    const now = cell.getDisplayValue().trim();
    if (typeof body.was === 'string' && now !== body.was.trim()) {
      return { status: 'conflict', value: now, rot: !!cell.getFormula() };
    }
    if (body.reset) {
      const f = rotationFormulas_(SpreadsheetApp.getActiveSpreadsheet(), cell.getSheet())[service + '|' + role];
      if (!f) throw new Error(role + ' has no rotation to go back to.');
      cell.setFormulaR1C1(f);
    } else if (value) {
      cell.setValue(value);
    } else {
      cell.clearContent();
    }
    SpreadsheetApp.flush();
    return { status: 'ok', value: cell.getDisplayValue().trim(), rot: !!cell.getFormula() };
  } finally {
    lock.releaseLock();
  }
}

/** null if the code is right, otherwise the reply to send back. */
function checkOrderCode_(code) {
  const want = PropertiesService.getScriptProperties().getProperty('ORDER_CODE');
  if (!want) throw new Error('Saving isn’t set up yet. In Apps Script, run setupOrderCode once.');
  const cache = CacheService.getScriptCache();
  const bad = Number(cache.get('badOrderCodes') || 0);
  if (bad >= MAX_BAD_CODES) throw new Error('Too many wrong codes. Try again in 10 minutes.');
  if (String(code || '').trim() === want) return null;
  cache.put('badOrderCodes', String(bad + 1), 600);
  return { status: 'badcode', message: 'That code isn’t right.' };
}

/** Run once from the editor: creates the order builder's code and prints it in the log. */
function setupOrderCode() {
  const props = PropertiesService.getScriptProperties();
  let code = props.getProperty('ORDER_CODE');
  if (!code) {
    code = String(Math.floor(100000 + Math.random() * 900000));
    props.setProperty('ORDER_CODE', code);
  }
  console.log('Order of service code: ' + code);
}

// ---------- Team iPad app ----------
//
// The music team's iPads (church-owned, set up through Mosyle) show the coming
// services: each one's order (order.view, saved by the builder), its songs as
// the separate PDFs and pages picked on the song packet page, and the order of
// service PDF. The app sends TEAM_KEY, a long random key set up once on each
// iPad, so nobody types a code but the music isn't open to the internet. It can
// only download files that are in the feed.

const TEAM_DAYS_AHEAD = 14;               // services from today through two weeks out
const TEAM_FILES_KEY = 'teamFiles';       // the file ids the app may download, kept in the script cache
const TEAM_FILES_SECONDS = 6 * 60 * 60;

/** Run once from the editor: makes the team app's key and prints it in the log. Running it again shows the same key. */
function setupTeamApp() {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('TEAM_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('TEAM_KEY', key);
  }
  console.log('Team app key: ' + key);
}

/** null if the key is right, otherwise the reply to send back. */
function checkTeamKey_(key) {
  const want = PropertiesService.getScriptProperties().getProperty('TEAM_KEY');
  if (!want) throw new Error('The team app isn’t set up yet. In Apps Script, run setupTeamApp once.');
  const cache = CacheService.getScriptCache();
  const bad = Number(cache.get('badTeamKeys') || 0);
  if (bad >= MAX_BAD_CODES) throw new Error('Too many wrong keys. Try again in 10 minutes.');
  if (String(key || '').trim() === want) return null;
  cache.put('badTeamKeys', String(bad + 1), 600);
  return { status: 'badkey', message: 'This iPad’s key isn’t right. Ask David to set it up again.' };
}

/**
 * POST {action: 'team', key}: the coming services, by day:
 * { days: [{ date, documents: [{ id, name, updated, size }],
 *            services: [{ service, label, cancelled, note, view, songs: [{ title, file, pages, name, modified, size }] }] }] }
 * view is the builder's finished order (null until the order is saved), songs the
 * packet page's picks for that service (empty until its packet is saved).
 */
function teamFeed_(body) {
  const refused = checkTeamKey_(body.key);
  if (refused) return refused;
  const tz = Session.getScriptTimeZone();
  const from = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const until = Utilities.formatDate(new Date(Date.now() + TEAM_DAYS_AHEAD * 86400000), tz, 'yyyy-MM-dd');
  const services = upcomingServices_().filter((svc) => svc.date >= from && svc.date <= until);
  const orders = savedOrders_(false).orders;
  const props = PropertiesService.getScriptProperties().getProperties();
  const index = {};
  pdfIndex_(false).forEach((f) => { index[f.id] = f; });
  const allowed = {};
  const days = [];
  services.forEach((svc) => {
    let day = days.filter((d) => d.date === svc.date)[0];
    if (!day) {
      day = { date: svc.date, documents: teamDocuments_(svc.date, services.filter((x) => x.date === svc.date)), services: [] };
      day.documents.forEach((d) => { allowed[d.id] = true; });
      days.push(day);
    }
    const note = (svc.items.filter((it) => it.role === NOTES_ROLE)[0] || {}).value || '';
    const order = orders[svc.date + '|' + svc.service];
    let packet = null;
    try { packet = JSON.parse(props['packet|' + svc.date + '|' + svc.service] || 'null'); } catch (err) { /* none */ }
    const songs = ((packet && packet.items) || []).filter((it) => it && it.file && !it.skip).map((it) => {
      allowed[it.file] = true;
      const f = index[it.file] || {};
      return { title: String(it.title || f.name || ''), file: it.file, pages: Array.isArray(it.pages) ? it.pages : null,
        name: f.name || '', modified: f.modified || '', size: f.size || 0 };
    });
    day.services.push({
      service: svc.service,
      label: SERVICE_LABEL[svc.service] || svc.service,
      cancelled: CANCELLED_NOTE.test(note),
      note: note,
      view: (order && order.view) || null,
      songs: songs,
    });
  });
  CacheService.getScriptCache().put(TEAM_FILES_KEY, JSON.stringify(Object.keys(allowed)), TEAM_FILES_SECONDS);
  return { status: 'ok', updated: new Date().toISOString(), days: days };
}

/** The order of service PDFs for a day: the musicians' copy when there is one, else the regular one. */
function teamDocuments_(date, services) {
  const folder = monthFolder_(date, false);
  if (!folder) return [];
  const names = [];
  services.forEach((svc) => {
    if (svc.service === 'Sunday AM' || svc.service === 'Sunday PM') names.push([date + '_Musicians Order of Service.pdf', date + '_Order of Service.pdf']);
    else if (svc.service === 'Wednesday') names.push([date + '_Wednesday Order of Service.pdf']);
    else names.push([date + '_' + svc.service + ' Order of Service.pdf']);
  });
  const out = [];
  names.forEach((choices) => {
    for (let i = 0; i < choices.length; i++) {
      if (out.some((d) => d.name === choices[i])) return;
      const f = newestFile_(folder, choices[i]);
      if (f) {
        out.push({ id: f.getId(), name: choices[i], updated: f.getLastUpdated().toISOString(), size: f.getSize() });
        return;
      }
    }
  });
  return out;
}

/** POST {action: 'teamFile', key, id}: one PDF from the team feed or Song PDFs, as base64. */
function teamFile_(body) {
  const refused = checkTeamKey_(body.key);
  if (refused) return refused;
  const id = String(body.id || '');
  let allowed = JSON.parse(CacheService.getScriptCache().get(TEAM_FILES_KEY) || 'null');
  if ((!allowed || allowed.indexOf(id) === -1) && !pdfIndex_(false).some((f) => f.id === id)) {
    teamFeed_(body);   // the cache ran out, or the feed changed since the app read it
    allowed = JSON.parse(CacheService.getScriptCache().get(TEAM_FILES_KEY) || '[]');
    if (allowed.indexOf(id) === -1) throw new Error('That file isn’t in this week’s music or Song PDFs anymore. Pull down to refresh.');
  }
  const file = DriveApp.getFileById(id);
  return { status: 'ok', id: id, updated: file.getLastUpdated().toISOString(), data: Utilities.base64Encode(file.getBlob().getBytes()) };
}

const TEAM_REREAD_SECONDS = 5 * 60;      // the app's "check Drive now" is honored at most this often
const PDF_KEYS_SHEET = 'PDF Keys';       // Song PDF | Folder | Key | How the key was found | Drive file ID
// Song PDFs the iPads' song library leaves out (the packet page still lists them).
const TEAM_HIDDEN_FOLDERS = ['Secular Love Songs'];     // top folders in Song PDFs
const TEAM_HIDDEN_FILES = [/^Hymns of Grace_MacArthur\.pdf$/i];   // whole-book PDFs

/**
 * POST {action: 'teamSongs', key, refresh}: the app's song library, every PDF in
 * Song PDFs (the packet page's listing, up to six hours old):
 * { updated, files: [{ id, name, folder, size, modified, song, title, key, original }],
 *   songs: [{ id, num, title, other, category, removed }] }
 * song is the Songs tab ID the PDF belongs to (matched by its title or other
 * names, like the packet page), or "t:<title words>" when it isn't on the Songs
 * tab, so the app can put a song's PDFs together. key comes from the PDF Keys
 * tab when it has a row for the file, else from the name ("_CCLI-G_" -> G).
 * original is true when the name gives no key: David names a PDF in its
 * default key without one ("How Great Thou Art_CCLI_4 Part"), and a
 * transposed one with it ("How Great Thou Art_CCLI-G_4 Part").
 * refresh reads Drive again.
 */
/** False for the Song PDFs the iPads' library leaves out (TEAM_HIDDEN_FOLDERS, TEAM_HIDDEN_FILES). */
function teamShows_(f) {
  const top = String(f.folder || '').split(' / ')[0];
  return TEAM_HIDDEN_FOLDERS.indexOf(top) === -1 && !TEAM_HIDDEN_FILES.some((rx) => rx.test(f.name));
}

function teamSongs_(body) {
  const refused = checkTeamKey_(body.key);
  if (refused) return refused;
  const cache = CacheService.getScriptCache();
  const refresh = !!body.refresh && !cache.get('teamReread');
  if (refresh) cache.put('teamReread', '1', TEAM_REREAD_SECONDS);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SONGS_SHEET);
  const rows = sheet ? readSongs_(sheet).filter((s) => s.title && s.id) : [];
  const names = [];
  rows.forEach((s) => {
    [s.title].concat(s.other ? s.other.split(/\s*;\s*/) : []).forEach((n) => {
      const all = teamAllWords_(n);
      if (all.length) names.push({ all: all, key: teamKeyWords_(all), versioned: /\(/.test(n), s: s });
    });
  });
  const exact = {};
  names.forEach((n) => { const k = n.key.join(' '); if (k && !(k in exact)) exact[k] = n.s; });
  const keys = pdfKeys_();
  const files = pdfIndex_(refresh).filter(teamShows_).map((f) => {
    const title = teamPdfTitle_(f.name);
    const nameKey = teamKeyFromName_(f.name);
    const all = teamAllWords_(title);
    const key = teamKeyWords_(all);
    let row = exact[key.join(' ')] || null;
    if (!row && key.length) {
      let best = 0;
      names.forEach((n) => { const sc = teamScore_(n, all, key); if (sc > best) { best = sc; row = n.s; } });
    }
    return { id: f.id, name: f.name, folder: f.folder, size: f.size, modified: f.modified,
      song: row ? row.id : 't:' + (key.join(' ') || f.id), title: row ? row.title : title,
      key: keys[f.id] || nameKey, original: !nameKey && !!keys[f.id] };
  });
  return {
    status: 'ok', updated: new Date().toISOString(), files: files,
    songs: rows.map((s) => ({ id: s.id, num: s.num, title: s.title, other: s.other, category: s.cat, removed: s.removed })),
  };
}

/** The PDF Keys tab: Drive file id -> key, for PDFs whose names don't say. */
function pdfKeys_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PDF_KEYS_SHEET);
  const out = {};
  if (!sheet || sheet.getLastRow() < 2) return out;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getDisplayValues().forEach((r) => {
    const id = String(r[4]).trim(), key = String(r[2]).trim().replace('♭', 'b').replace('♯', '#');
    if (id && /^[A-G][b#]?m?$/.test(key)) out[id] = key;
  });
  return out;
}

// Title matching for the library. Stricter than the packet page's (where David
// picks from the matches): a PDF joins a Songs tab song only when the titles are
// the same, differ by a typo, or one starts the other ("It Is Well With My
// Soul" -> "It Is Well"). Anything else is its own song in the library.
const TEAM_STOP_WORDS = ['the', 'a', 'an', 'o', 'oh', 'and', 'to', 'of'];

/** "06_All My Boast Is In Jesus-lead-G.pdf" -> "All My Boast Is In Jesus"; "Come Christians Join To Sing_CCLI-G_4 Part.pdf" -> "Come Christians Join To Sing" */
function teamPdfTitle_(name) {
  let base = String(name || '').replace(/\.pdf$/i, '').replace(/^\s*\d{1,2}[a-z]?[_.\s]+(?=\D)/i, '').trim();
  if (base.indexOf(' ') === -1 && base.split('_').length >= 5) base = base.replace(/_/g, ' ');   // "all_i_have_is_christ_HYMN"
  return base.split('_')[0].split(/\s+[-–]\s+/)[0].split(/-(?:lead|vocal)\b/i)[0].replace(/\s+copy$/i, '').trim() || base;
}

/** Every word, lowercase, without accents, apostrophes or anything in parentheses. */
function teamAllWords_(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/['’]/g, '').replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
    .split(' ').filter(Boolean);
}

function teamKeyWords_(all) {
  return all.filter((w) => TEAM_STOP_WORDS.indexOf(w) === -1);
}

/** 0 = not the same song; higher is a closer match. */
function teamScore_(name, fileAll, fileKey) {
  const a = name.key, b = fileKey;
  if (a.length >= 3 && a.length === b.length &&
      a.every((w, i) => w === b[i] || (w.length >= 5 && teamOneEdit_(w, b[i])))) return 90;
  // One title starts the other, word for word ("O" and "Oh" alike), and the shorter has three words or more.
  // Not for a Songs tab title naming its version, like "Behold the Lamb (Communion Hymn)".
  if (name.versioned) return 0;
  const x = name.all.map((w) => (w === 'oh' ? 'o' : w)), y = fileAll.map((w) => (w === 'oh' ? 'o' : w));
  const short = x.length <= y.length ? x : y, long = short === x ? y : x;
  if (short.length >= 3 && teamKeyWords_(short).length >= 2 && short.every((w, i) => w === long[i])) return 50 + short.length;
  return 0;
}

/**
 * The key a PDF's name gives, or '': "How Great Thou Art_CCLI-G_4 Part" -> "G",
 * any "Source-Key" ("Getty-D", "T4G-D", "Praise-Ab"), "_F_Lead", "(Bb)", "-lead-Dm", "Key of Eb".
 */
function teamKeyFromName_(name) {
  const b = String(name || '').replace(/\.pdf$/i, '');
  const K = '([A-G](?:b|#|♭|♯)?m?)';
  const patterns = [
    new RegExp('(?:^|[_\\s(])[A-Za-z][A-Za-z0-9+]*-' + K + '(?=$|[_\\s).-])'),
    new RegExp('_' + K + '(?=_|$)'),
    new RegExp('\\(' + K + '\\)'),
    new RegExp('-(?:lead|vocal|chords?)-' + K + '(?=$|[_\\s.-])'),
    new RegExp('\\b[Kk]ey of ' + K + '\\b'),
    new RegExp('\\s-\\s' + K + '\\s-\\s'),
    new RegExp('_' + K + '\\s(?:Lead|Hymn|Choral|Chords)'),
    new RegExp('\\s' + K + '_(?:Lead|Hymn)'),
  ];
  for (let i = 0; i < patterns.length; i++) {
    const m = patterns[i].exec(b);
    if (m) return m[1].replace('♭', 'b').replace('♯', '#');
  }
  return '';
}

/** True when two words differ by one letter added, dropped or changed ("womdrous", "wondrous"). */
function teamOneEdit_(a, b) {
  if (!b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

// ---------- Song packets ----------

/**
 * POST {action: 'packetSetup', code, date, service, refresh}: everything the
 * packet page needs for one service: the PDFs in Song PDFs, the Songs tab (for
 * other names), the PDF last picked for each song, what was in this packet the
 * last time it was saved, and whether its file is already in Drive.
 */
function packetSetup_(body) {
  const refused = checkOrderCode_(body.code);
  if (refused) return refused;
  const date = packetDate_(body.date);
  const service = packetService_(body.service);
  const props = PropertiesService.getScriptProperties().getProperties();
  const picks = {};
  Object.keys(props).forEach((k) => { if (k.indexOf('pick|') === 0) picks[k.slice(5)] = props[k]; });
  const saved = props['packet|' + date + '|' + service];
  const name = packetName_(date, service);
  const folder = monthFolder_(date, false);
  const existing = folder ? newestFile_(folder, name) : null;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SONGS_SHEET);
  const songs = sheet ? readSongs_(sheet).map((s) => ({ num: s.num, title: s.title, other: s.other, id: s.id })) : [];
  return {
    status: 'ok', name: name, files: pdfIndex_(!!body.refresh), songs: songs, picks: picks,
    packet: saved ? JSON.parse(saved) : null,
    existing: existing ? { url: existing.getUrl(), updated: existing.getLastUpdated().toISOString() } : null,
  };
}

/** POST {action: 'pdfFile', code, id}: one PDF from Song PDFs, as base64. */
function pdfFile_(body) {
  const refused = checkOrderCode_(body.code);
  if (refused) return refused;
  const id = String(body.id || '');
  let entry = pdfIndex_(false).filter((f) => f.id === id)[0];
  if (!entry) entry = pdfIndex_(true).filter((f) => f.id === id)[0];
  if (!entry) throw new Error('That PDF isn’t in the Song PDFs folder anymore. Click Re-read Drive and try again.');
  const bytes = DriveApp.getFileById(id).getBlob().getBytes();
  return { status: 'ok', id: id, data: Utilities.base64Encode(bytes) };
}

/**
 * POST {action: 'uploadPdf', code, name, data}: keeps a PDF chosen from the
 * computer in Song PDFs / Added from the packet page, so it's there next time.
 */
function uploadPdf_(body) {
  const refused = checkOrderCode_(body.code);
  if (refused) return refused;
  const bytes = pdfBytes_(body.data, MAX_PDF_BYTES);
  let name = String(body.name || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').replace(/^[.\s]+/, '').trim().slice(0, 120) || 'Song';
  if (!/\.pdf$/i.test(name)) name += '.pdf';
  const songFolder = DriveApp.getFolderById(SONG_PDFS_FOLDER);
  const found = songFolder.getFoldersByName(UPLOADS_FOLDER);
  const folder = found.hasNext() ? found.next() : songFolder.createFolder(UPLOADS_FOLDER);
  const file = folder.createFile(Utilities.newBlob(bytes, 'application/pdf', name));
  const entry = { id: file.getId(), name: name, folder: UPLOADS_FOLDER, size: bytes.length,
    modified: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd') };
  const files = pdfIndex_(false);
  files.push(entry);
  cacheIndex_(files);
  return { status: 'ok', file: entry };
}

/**
 * POST {action: 'savePacket', code, date, service, data, picks, packet}: puts
 * the combined PDF in Orders of Service / 2026 / 11_November as
 * "2026-11-01_AM.pdf". An older file with that name goes to the Drive trash.
 * picks is {song key: file id}, or "file id|4,5,6" when only some pages are
 * used, remembered for the next time each song comes up; packet is the page's
 * list, kept so the packet reopens the same way.
 */
function savePacket_(body) {
  const refused = checkOrderCode_(body.code);
  if (refused) return refused;
  const date = packetDate_(body.date);
  const service = packetService_(body.service);
  const bytes = pdfBytes_(body.data, MAX_PACKET_BYTES);
  const name = packetName_(date, service);
  const packet = JSON.stringify(body.packet || null);
  if (packet.length > 8000) throw new Error('That packet has too many songs to remember. It wasn’t saved.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const folder = monthFolder_(date, true);
    const old = folder.getFilesByName(name);
    let replaced = 0;
    while (old.hasNext()) { old.next().setTrashed(true); replaced++; }
    const file = folder.createFile(Utilities.newBlob(bytes, 'application/pdf', name));

    const props = PropertiesService.getScriptProperties();
    const keep = {};
    const picks = body.picks || {};
    Object.keys(picks).slice(0, 40).forEach((k) => {
      const id = String(picks[k] || '');
      if (k.length <= 100 && /^[\w-]{10,80}(\|\d{1,3}(,\d{1,3}){0,99})?$/.test(id)) keep['pick|' + k] = id;
    });
    keep['packet|' + date + '|' + service] = packet;
    props.setProperties(keep);
    prunePackets_(props);
    return { status: 'ok', name: name, url: file.getUrl(), replaced: replaced };
  } finally {
    lock.releaseLock();
  }
}

/**
 * POST {action: 'saveOrderPdf', code, date, name, data}: the builder's Save PDF.
 * Puts the order of service in Orders of Service / 2026 / 11_November as
 * "2026-11-01_Order of Service.pdf" (or "2026-11-04_Wednesday Order of
 * Service.pdf"), where the weekly email looks for it. An older file with that
 * name goes to the Drive trash.
 */
function saveOrderPdf_(body) {
  const refused = checkOrderCode_(body.code);
  if (refused) return refused;
  const date = packetDate_(body.date);
  const name = String(body.name || '');
  if (name.slice(0, 11) !== date + '_' || !/^\d{4}-\d{2}-\d{2}_[A-Za-z0-9 '&-]{0,40}Order of Service\.pdf$/.test(name)) {
    throw new Error('That file name doesn’t look right. Reload the page and try again.');
  }
  const bytes = pdfBytes_(body.data, MAX_PDF_BYTES);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const folder = monthFolder_(date, true);
    const old = folder.getFilesByName(name);
    let replaced = 0;
    while (old.hasNext()) { old.next().setTrashed(true); replaced++; }
    const file = folder.createFile(Utilities.newBlob(bytes, 'application/pdf', name));
    return { status: 'ok', name: name, url: file.getUrl(), folder: date.slice(0, 4) + ' › ' + folder.getName(), replaced: replaced };
  } finally {
    lock.releaseLock();
  }
}

function packetDate_(value) {
  const date = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('That date doesn’t look right. Reload the page and try again.');
  return date;
}

function packetService_(value) {
  const service = String(value || '').trim();
  if (!/^[A-Za-z0-9 '&-]{1,40}$/.test(service)) throw new Error('That service doesn’t look right. Reload the page and try again.');
  return service;
}

/** "2026-11-01_AM.pdf", "2026-11-04_Wed.pdf", "2026-12-24_Christmas Eve.pdf" */
function packetName_(date, service) {
  return date + '_' + (PACKET_SUFFIX[service] || service) + '.pdf';
}

function pdfBytes_(data, max) {
  const bytes = Utilities.base64Decode(String(data || ''));
  if (bytes.length < 5 || String.fromCharCode.apply(null, bytes.slice(0, 5)) !== '%PDF-') throw new Error('That file isn’t a PDF.');
  if (bytes.length > max) throw new Error('That PDF is too big (over ' + Math.round(max / 1048576) + ' MB).');
  return bytes;
}

/** Orders of Service / 2026 / 11_November, made if create is true; otherwise null if it isn't there. */
function monthFolder_(date, create) {
  const m = Number(date.slice(5, 7));
  const names = [date.slice(0, 4), String(m).padStart(2, '0') + '_' + MONTH_NAMES[m - 1]];
  let folder = DriveApp.getFolderById(ORDERS_FOLDER);
  for (let i = 0; i < names.length; i++) {
    const found = folder.getFoldersByName(names[i]);
    if (found.hasNext()) folder = found.next();
    else if (create) folder = folder.createFolder(names[i]);
    else return null;
  }
  return folder;
}

function newestFile_(folder, name) {
  const files = folder.getFilesByName(name);
  let best = null;
  while (files.hasNext()) {
    const f = files.next();
    if (!best || f.getLastUpdated() > best.getLastUpdated()) best = f;
  }
  return best;
}

/**
 * Every PDF in Song PDFs and its subfolders: {id, name, folder, size, modified}.
 * Reading Drive takes a few seconds, so the list is cached for six hours;
 * refresh reads it again (the page's Re-read Drive button).
 */
function pdfIndex_(refresh) {
  const cache = CacheService.getScriptCache();
  if (!refresh) {
    const n = Number(cache.get(PDF_INDEX_KEY) || 0);
    const keys = [];
    for (let i = 0; i < n; i++) keys.push(PDF_INDEX_KEY + i);
    const parts = n ? cache.getAll(keys) : {};
    if (n && keys.every((k) => k in parts)) return JSON.parse(keys.map((k) => parts[k]).join(''));
  }
  const files = [];
  const walk = (folderId, path, depth) => {
    driveChildren_(folderId).forEach((f) => {
      if (f.mimeType === 'application/vnd.google-apps.folder') {
        if (depth < 6) walk(f.id, path ? path + ' / ' + f.name : f.name, depth + 1);
      } else if (f.mimeType === 'application/pdf' && Number(f.size || 0) <= MAX_PDF_BYTES) {
        files.push({ id: f.id, name: f.name, folder: path, size: Number(f.size || 0), modified: String(f.modifiedTime || '').slice(0, 10) });
      }
    });
  };
  walk(SONG_PDFS_FOLDER, '', 0);
  cacheIndex_(files);
  return files;
}

function cacheIndex_(files) {
  const json = JSON.stringify(files);
  const size = 50000;   // a cache value can hold 100 KB
  const parts = {};
  let n = 0;
  for (let i = 0; i < json.length; i += size) parts[PDF_INDEX_KEY + n++] = json.slice(i, i + size);
  parts[PDF_INDEX_KEY] = String(n);
  CacheService.getScriptCache().putAll(parts, PDF_INDEX_SECONDS);
}

/**
 * One folder's files and folders, from the Drive service (one request per 1,000
 * instead of one per file). Needs Services > Drive API added in Apps Script.
 */
function driveChildren_(folderId) {
  if (typeof Drive === 'undefined') {
    throw new Error('The Drive service is off. In Apps Script, click + next to Services, pick Drive API, and click Add.');
  }
  const out = [];
  let page = '';
  do {
    const params = {
      q: "'" + folderId + "' in parents and trashed = false",
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime)',
      pageSize: 1000,
    };
    if (page) params.pageToken = page;
    const res = Drive.Files.list(params);
    (res.files || []).forEach((f) => out.push(f));
    page = res.nextPageToken || '';
  } while (page);
  return out;
}

/** Forgets what was in packets more than PACKET_DAYS_KEPT days old. */
function prunePackets_(props) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PACKET_DAYS_KEPT);
  const before = Utilities.formatDate(cutoff, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  props.getKeys().forEach((k) => {
    const m = /^packet\|(\d{4}-\d{2}-\d{2})\|/.exec(k);
    if (m && m[1] < before) props.deleteProperty(k);
  });
}

/**
 * Run once from the editor after pasting this code and adding the Drive API
 * service: Google asks to let the script read and add files in Drive, then it
 * lists the Song PDFs folder.
 */
function setupSongPackets() {
  const files = pdfIndex_(true);
  console.log('Song PDFs: ' + files.length + ' PDFs found. Now deploy a new version (Deploy > Manage deployments > Edit > New version).');
}

// ---------- Sheet menu ----------

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Music Schedule')
    .addItem('Reset selected cells to rotation', 'resetSelectionToRotation')
    .addItem('Add next month', 'addNextMonth')
    .addSeparator()
    .addItem('Update song list', 'updateSongList')
    .addToUi();
}

/** Re-sorts the Songs tab when a song's Category or Removed box changes, or a Majesty note comes or goes. */
function onEdit(e) {
  const r = e && e.range;
  if (!r || r.getSheet().getName() !== SONGS_SHEET || r.getLastRow() < 2) return;
  const touches = (col) => r.getColumn() <= col && r.getLastColumn() >= col;
  const majesty = touches(6) && (MAJESTY_NOTE.test(e.value || '') || MAJESTY_NOTE.test(e.oldValue || ''));
  if (!touches(5) && !touches(7) && !majesty) return;
  // Wait until a new song has a number or title before moving it.
  const ab = r.getSheet().getRange(r.getRow(), 1, r.getNumRows(), 2).getValues();
  if (ab.some((row) => String(row[0]).trim() || String(row[1]).trim())) sortSongs_();
}

/**
 * Puts the rotation formula back in every selected name cell, undoing names
 * typed over it. Cells in rows that never had a formula (songs, offering,
 * notes) are left alone.
 */
function resetSelectionToRotation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  if (!isMonthSheet_(sheet)) {
    toast_('Select the cells to reset on a month tab first.');
    return;
  }
  const formulas = rotationFormulas_(ss, sheet);
  const keys = rowKeys_(sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 2).getDisplayValues());
  const list = ss.getActiveRangeList();
  let reset = 0;

  (list ? list.getRanges() : []).forEach((range) => {
    const first = Math.max(range.getColumn(), FIRST_DATE_COL);
    const last = Math.min(range.getLastColumn(), FIRST_DATE_COL + DATE_COLS - 1);
    if (first > last) return;
    for (let r = range.getRow(); r <= range.getLastRow(); r++) {
      const f = formulas[keys[r - 1]];
      if (!f) continue;
      sheet.getRange(r, first, 1, last - first + 1).setFormulaR1C1(f);
      reset += last - first + 1;
    }
  });

  toast_(reset
    ? 'Reset ' + reset + (reset === 1 ? ' cell' : ' cells') + ' to the rotation.'
    : 'Nothing to reset. Select name cells (not songs or notes) and try again.');
}

/**
 * Copies the latest month tab, names it for the next month ("Jan 2027"), and
 * sets B1 so its dates update. Every name cell goes back to the rotation, and
 * songs, offering, special and notes start blank.
 */
function addNextMonth() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();

  let latest = null, latestKey = '';
  monthSheets_(ss).forEach((s) => {
    const d = s.getRange('B1').getValue();
    if (!(d instanceof Date)) return;
    const key = Utilities.formatDate(d, tz, 'yyyy-MM');
    if (key > latestKey) { latest = s; latestKey = key; }
  });
  if (!latest) {
    toast_('No month tab found. A month tab has "Month" in A1 and the month\'s first day in B1.');
    return;
  }

  const [y, m] = latestKey.split('-').map(Number);
  const next = m === 12 ? [y + 1, 1] : [y, m + 1];
  const name = Utilities.formatDate(new Date(next[0], next[1] - 1, 15), tz, 'MMM yyyy');
  const existing = ss.getSheetByName(name);
  if (existing) {
    ss.setActiveSheet(existing);
    toast_(name + ' already exists.');
    return;
  }

  const formulas = rotationFormulas_(ss, latest);
  const sheet = latest.copyTo(ss).setName(name);
  ss.setActiveSheet(sheet);
  ss.moveActiveSheet(latest.getIndex() + 1);
  sheet.getRange('B1').setFormula('=DATE(' + next[0] + ',' + next[1] + ',1)');

  removeOneTimeServices_(sheet);
  const keys = rowKeys_(sheet.getRange(1, 1, sheet.getLastRow(), 2).getDisplayValues());
  keys.forEach((key, i) => {
    if (!key) return;
    const row = sheet.getRange(i + 1, FIRST_DATE_COL, 1, DATE_COLS);
    if (formulas[key]) row.setFormulaR1C1(formulas[key]);
    else row.clearContent();
  });
  toast_(name + ' is ready. Names come from the rotation; songs and notes are blank.');
}

/**
 * Deletes blocks for one-time services (any header not in SERVICES, such as
 * "Christmas Eve") from a newly copied month, with the blank row above each.
 */
function removeOneTimeServices_(sheet) {
  const labels = sheet.getRange(1, 1, sheet.getLastRow(), 2).getDisplayValues()
    .map((row) => [String(row[0]).trim(), String(row[1]).trim()]);
  const blocks = [];
  for (let i = 2; i < labels.length; i++) {
    const [a, b] = labels[i];
    if (!a || b || SERVICES.indexOf(a) >= 0) continue;
    let end = i;
    while (end + 1 < labels.length && (labels[end + 1][0] || labels[end + 1][1])) end++;
    const start = !labels[i - 1][0] && !labels[i - 1][1] ? i - 1 : i;
    blocks.push([start, end]);
    i = end;
  }
  blocks.reverse().forEach(([start, end]) => sheet.deleteRows(start + 1, end - start + 1));
}

function isMonthSheet_(sheet) {
  return sheet.getRange('A1').getDisplayValue().trim() === 'Month';
}

function monthSheets_(ss) {
  return ss.getSheets().filter(isMonthSheet_);
}

/**
 * One key per row of a month tab, "Sunday AM|Piano", or null for rows that
 * aren't roles (the month row, service headers, Week rows, blank rows).
 */
function rowKeys_(labels) {
  let service = '';
  return labels.map((row) => {
    const a = String(row[0]).trim();
    const b = String(row[1]).trim();
    if (a && !b) { service = a; return null; }  // a service header
    if (!service || !b || b === 'Week') return null;
    return service + '|' + b;
  });
}

/**
 * The rotation formula for each role, keyed like rowKeys_. A role's five
 * cells share one formula in R1C1 form, so any cell that still has it will
 * do. Looks in `first` before the other month tabs, in case every week of a
 * role was typed over.
 */
function rotationFormulas_(ss, first) {
  const out = {};
  const sheets = [first].concat(monthSheets_(ss).filter((s) => s.getSheetId() !== first.getSheetId()));
  sheets.forEach((sheet) => {
    const last = sheet.getLastRow();
    if (!last) return;
    const keys = rowKeys_(sheet.getRange(1, 1, last, 2).getDisplayValues());
    const f = sheet.getRange(1, FIRST_DATE_COL, last, DATE_COLS).getFormulasR1C1();
    keys.forEach((key, i) => {
      if (!key || out[key]) return;
      const found = f[i].find((x) => x);
      if (found) out[key] = found;
    });
  });
  return out;
}

function toast_(msg) {
  SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'Music Schedule', 6);
}

// ---------- Songs and the Song Log ----------

/** Run once from the editor: updates the song list now and every night around 2 AM. */
function setupSongList() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'updateSongList')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('updateSongList').timeBased().everyDays(1).atHour(2).create();
  updateSongList();
}

/** Menu item and nightly trigger. */
function updateSongList() {
  const res = syncSongLog_();
  const msg = 'Song list updated: ' + res.logged + ' songs from the schedule' +
    (res.unmatched ? ', ' + res.unmatched + ' not matched (highlighted on the Song Log)' : '') + '.';
  try { toast_(msg); } catch (err) { console.log(msg); }   // no toast from the nightly trigger
}

/**
 * Rewrites the Song Log's schedule rows from every month tab, keeping imported
 * and hand-typed rows. Schedule rows from months that no longer have a tab are
 * kept too, so deleting an old month doesn't erase its history.
 */
function syncSongLog_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = ss.getSheetByName(SONG_LOG_SHEET);
  if (!log || !ss.getSheetByName(SONGS_SHEET)) throw new Error('The Songs and Song Log tabs are missing.');
  sortSongs_();   // gives new songs their IDs first
  const match = songMatcher_(readSongs_(ss.getSheetByName(SONGS_SHEET)));
  const tz = Session.getScriptTimeZone();

  const fresh = [];
  const months = {};
  monthSheets_(ss).forEach((sheet) => readMonth_(sheet, tz).forEach((svc) => {
    months[svc.date.slice(0, 7)] = true;
    const note = (svc.items.find((it) => it.role === NOTES_ROLE) || {}).value || '';
    if (CANCELLED_NOTE.test(note)) return;
    svc.items.forEach((it) => {
      if (it.section !== SONG_SECTION) return;
      fresh.push([dateFromKey_(svc.date), match(it.value), 'Schedule', SERVICE_LABEL[svc.service] || svc.service, it.role, it.value]);
    });
  }));

  const dayKey = (d, id) => Utilities.formatDate(d, tz, 'yyyy-MM-dd') + '|' + id;
  const taken = {};
  fresh.forEach((r) => { if (r[1]) taken[dayKey(r[0], r[1])] = true; });
  const last = log.getLastRow();
  const old = last > 1 ? log.getRange(2, 1, last - 1, 6).getValues() : [];
  const kept = old.filter((r) => r[0] instanceof Date &&
      !(r[2] === 'Schedule' && months[Utilities.formatDate(r[0], tz, 'yyyy-MM')]) &&
      !(r[1] && taken[dayKey(r[0], r[1])]))
    .map((r) => { if (!r[1] && r[5]) r[1] = match(r[5]); return r; });

  const rows = fresh.concat(kept).sort((a, b) => b[0] - a[0]);
  if (last > 1) log.getRange(2, 1, last - 1, 6).clearContent();
  if (rows.length) {
    log.getRange(2, 1, rows.length, 6).setValues(rows);
    log.getRange(2, 1, rows.length, 1).setNumberFormat('m/d/yyyy');
  }
  return { logged: fresh.length, unmatched: rows.filter((r) => !r[1] && r[5]).length };
}

function dateFromKey_(key) {
  const p = key.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

/** Song rows on the Songs tab: anything typed in a row that isn't a heading, so a half-entered song is never lost. */
function readSongs_(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const headings = SONG_HEADINGS.concat([NEW_SONGS_LABEL]);
  return sheet.getRange(2, 1, last - 1, SONG_COLS).getValues()
    .filter((r) => {
      const a = String(r[0]).trim(), b = String(r[1]).trim();
      const typed = a || b || [4, 5, 7].some((c) => String(r[c]).trim());
      return typed && !(headings.indexOf(a) >= 0 && !b);
    })
    .map((r) => ({ num: String(r[0]).trim(), title: String(r[1]).trim(), cat: String(r[4]).trim(),
      notes: String(r[5]).trim(), removed: r[6] === true, other: String(r[7]).trim(), id: String(r[8]).trim() }));
}

/** Hymns get "#327"; other songs get the next "M###". An ID never changes, so renaming a song keeps its history. */
function assignSongIds_(songs) {
  let top = 0;
  songs.forEach((s) => { const m = /^M(\d+)$/.exec(s.id); if (m) top = Math.max(top, Number(m[1])); });
  songs.forEach((s) => {
    if (s.id) return;
    s.id = s.num ? '#' + s.num : 'M' + String(++top).padStart(3, '0');
  });
}

/** The song's Majesty hymnal number, or 0. Songs with a Rejoice number stay with the hymns. */
function majestyNum_(s) {
  const m = s.num ? null : MAJESTY_NOTE.exec(s.notes);
  return m ? Number(m[1]) : 0;
}

function songSection_(s) {
  if (s.removed) return 4;
  if (s.cat.toLowerCase() === 'christmas') return 3;
  if (s.num) return 0;
  return majestyNum_(s) ? 1 : 2;
}

function compareSongs_(a, b) {
  if (!!a.num !== !!b.num) return a.num ? -1 : 1;
  if (a.num) {
    const d = (parseInt(a.num, 10) || 99999) - (parseInt(b.num, 10) || 99999);
    return d || (a.num < b.num ? -1 : a.num > b.num ? 1 : 0);
  }
  const ma = majestyNum_(a), mb = majestyNum_(b);
  if (!!ma !== !!mb) return ma ? -1 : 1;
  if (ma !== mb) return ma - mb;
  const x = a.title.toLowerCase(), y = b.title.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Rewrites the Songs tab in its five sections, with a few blank rows at the bottom for new songs. */
function sortSongs_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SONGS_SHEET);
  if (!sheet) return;
  const songs = readSongs_(sheet);
  assignSongIds_(songs);
  const groups = SONG_HEADINGS.map(() => []);
  songs.forEach((s) => groups[songSection_(s)].push(s));

  const left = [], right = [], kinds = [];
  const put = (kind, l, r) => { kinds.push(kind); left.push(l); right.push(r); };
  groups.forEach((g, i) => {
    if (i) put('blank', ['', ''], ['', '', '', '', '']);
    put('heading', [SONG_HEADINGS[i], ''], ['', '', '', '', '']);
    g.sort(compareSongs_).forEach((s) => put('song', [s.num, s.title], [s.cat, s.notes, s.removed, s.other, s.id]));
  });
  put('blank', ['', ''], ['', '', '', '', '']);
  put('new', [NEW_SONGS_LABEL, ''], ['', '', '', '', '']);
  for (let i = 0; i < NEW_SONG_ROWS; i++) put('newrow', ['', ''], ['', '', false, '', '']);

  const n = left.length;
  const old = Math.max(sheet.getLastRow() - 1, 0);
  if (old > n) {
    sheet.getRange(n + 2, 1, old - n, 2).clearContent();
    sheet.getRange(n + 2, 5, old - n, SONG_COLS - 4).clearContent().clearDataValidations();
    sheet.getRange(n + 2, 1, old - n, SONG_COLS).setFontWeight('normal').setFontStyle('normal').setBackground(null);
  }
  sheet.getRange(2, 1, n, 2).setValues(left);
  sheet.getRange(2, 5, n, SONG_COLS - 4).setValues(right);

  const box = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  sheet.getRange(2, 7, n, 1).setDataValidations(kinds.map((k) => [k === 'song' || k === 'newrow' ? box : null]));
  sheet.getRange(2, 1, n, SONG_COLS)
    .setFontWeights(kinds.map((k) => Array(SONG_COLS).fill(k === 'heading' ? 'bold' : 'normal')))
    .setFontStyles(kinds.map((k) => Array(SONG_COLS).fill(k === 'new' ? 'italic' : 'normal')))
    .setBackgrounds(kinds.map((k) => Array(SONG_COLS).fill(k === 'heading' ? '#d9e2ec' : k === 'new' ? '#f3f3f3' : null)));
  sheet.getRange(2, 3, n, 1).setNumberFormat('m/d/yy');
}

/**
 * Turns what's typed in a song cell ("327 He Lives", "*New* I Set My Hope on
 * Jesus", "Hail the Day") into a song ID, or '' if it can't tell. With a
 * number, a hymn whose title matches wins (so a mistyped number still finds
 * the right hymn), then the number. Without one, modern songs are checked
 * before hymns. Each check is tried as typed, then ignoring anything in
 * parentheses. Two songs with the same name match neither.
 */
function songMatcher_(songs) {
  const norm = (t) => String(t).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  const bare = (t) => norm(String(t).replace(/\([^)]*\)/g, ' '));
  const byNum = {}, modern = {}, hymn = {}, modernBare = {}, hymnBare = {};
  const add = (map, key, id) => { if (key) map[key] = (key in map && map[key] !== id) ? null : id; };
  songs.forEach((s) => {
    if (!s.id) return;
    if (s.num) byNum[s.num.replace(/\s+/g, '')] = s.id;
    const names = [s.title].concat(s.other ? s.other.split(/\s*;\s*/) : []).filter(Boolean);
    names.forEach((t) => {
      add(s.num ? hymn : modern, norm(t), s.id);
      add(s.num ? hymnBare : modernBare, bare(t), s.id);
    });
  });
  return (value) => {
    let t = String(value || '').trim().replace(/^\*\s*new\s*\*\s*/i, '');
    if (/^\d{1,4}$/.test(t)) return byNum[t] || '';
    const m = /^(\d{1,4}(?:\s*-\s*\d{1,4})?)\.?\s+(.+)$/.exec(t);
    if (m) {
      const k = norm(m[2]), b = bare(m[2]);
      return hymn[k] || hymnBare[b] || byNum[m[1].replace(/\s+/g, '')] || modern[k] || modernBare[b] || '';
    }
    const k = norm(t), b = bare(t);
    return modern[k] || hymn[k] || modernBare[b] || hymnBare[b] || '';
  };
}
