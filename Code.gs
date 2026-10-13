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
 * starts with a row whose column A is one of SERVICES and whose columns C:G
 * hold dates, then a "Week" row, then one row per role until a blank row.
 *
 * It also adds a Music Schedule menu to the Sheet: one item puts the rotation
 * formulas back in selected cells, the other builds the next month's tab.
 */

const SERVICES = ['Sunday AM', 'Sunday PM', 'Wednesday'];
const FIRST_DATE_COL = 3; // column C
const DATE_COLS = 5;      // C:G, up to five weeks
const DAYS_BACK = 1;      // keep yesterday's services so Sunday night still shows Sunday

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
    if (SERVICES.indexOf(service) < 0) { r++; continue; }

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
      if (SERVICES.indexOf(sec) >= 0) break;
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

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
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

  const keys = rowKeys_(sheet.getRange(1, 1, sheet.getLastRow(), 2).getDisplayValues());
  keys.forEach((key, i) => {
    if (!key) return;
    const row = sheet.getRange(i + 1, FIRST_DATE_COL, 1, DATE_COLS);
    if (formulas[key]) row.setFormulaR1C1(formulas[key]);
    else row.clearContent();
  });
  toast_(name + ' is ready. Names come from the rotation; songs and notes are blank.');
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
    if (SERVICES.indexOf(a) >= 0) { service = a; return null; }
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
