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
