/**
 * Grace Baptist Church - Music Schedule
 *
 * Back end for the volunteers' schedule page (index.html, hosted on GitHub
 * Pages). doGet reads every month tab in this spreadsheet and returns the
 * upcoming services as JSON. It never reads the Rotation or Away tabs, so
 * who's out of town stays private.
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
 * It also adds a Music Schedule menu to the Sheet: one item puts the rotation
 * formulas back in selected cells, the other builds the next month's tab.
 */

const SERVICES = ['Sunday AM', 'Sunday PM', 'Wednesday'];  // repeat every month
const FIRST_DATE_COL = 3; // column C
const DATE_COLS = 5;      // C:G, up to five weeks
const DAYS_BACK = 1;      // keep yesterday's services so Sunday night still shows Sunday

const AWAY_SHEET = 'Away';
const PAGE_NOTE = 'Volunteer page';  // Note column prefix on rows the page adds, so Undo only removes those
const MAX_POSTS = 40;                // "I'll be out" requests allowed per 10 minutes, across all phones
const SERVICE_LABEL = { 'Sunday AM': 'Sunday Morning', 'Sunday PM': 'Sunday Evening', 'Wednesday': 'Wednesday Evening' };

/** GET: upcoming services, oldest first. */
function doGet() {
  try {
    return json_({ services: upcomingServices_(), updated: new Date().toISOString() });
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

// ---------- Sheet menu ----------

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Music Schedule')
    .addItem('Reset selected cells to rotation', 'resetSelectionToRotation')
    .addItem('Add next month', 'addNextMonth')
    .addToUi();
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
