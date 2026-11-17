// The song library's "has anything changed?" stamp, and the 10-minute refresh that keeps it honest.
import { createHash } from "node:crypto";
import { load, ok, section } from './harness.js';
section('Song library stamp and refresh');
let drive = [{ id: 'b', name: 'Amazing Grace_4 Part.pdf', mimeType: 'application/pdf', size: '100', modifiedTime: '2026-11-01T00:00:00Z' },
             { id: 'a', name: 'Living Hope_CCLI-C_4 Part.pdf', mimeType: 'application/pdf', size: '200', modifiedTime: '2026-11-02T00:00:00Z' }];
let walks = 0, triggers = [];
const store = new Map();
const cache = { get: (k) => store.has(k) ? store.get(k) : null, put: (k, v) => store.set(k, v),
  getAll: (ks) => Object.fromEntries(ks.filter((k) => store.has(k)).map((k) => [k, store.get(k)])),
  putAll: (o) => Object.entries(o).forEach(([k, v]) => store.set(k, v)) };
const g = {
  CacheService: { getScriptCache: () => cache },
  Utilities: { DigestAlgorithm: { MD5: 'md5' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (_a, t) => Array.from(new Int8Array(createHash('md5').update(t, 'utf8').digest())), getUuid: () => 'x' },
  Drive: { Files: { list: () => { walks++; return { files: drive }; } } },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => null }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => k === 'TEAM_KEY' ? 'K' : null, getProperties: () => ({ TEAM_KEY: 'K' }) }) },
  ScriptApp: { getProjectTriggers: () => triggers.slice(), deleteTrigger: (t) => { triggers = triggers.filter((x) => x !== t); },
    newTrigger: (fn) => ({ timeBased: () => ({ everyMinutes: (n) => ({ create: () => triggers.push({ getHandlerFunction: () => fn, n }) }) }) }) },
  Session: { getScriptTimeZone: () => 'America/Indiana/Indianapolis' },
};
const api = load(g, ['teamSongs_', 'refreshSongLibrary', 'setupSongRefresh', 'digest_', 'pdfIndex_']);

ok(/^[0-9a-f]{32}$/.test(api.digest_('hello')) && api.digest_('hello') === createHash('md5').update('hello').digest('hex'), 'digest_ is the md5 in hex');
const first = api.teamSongs_({ key: 'K' });
ok(first.status === 'ok' && first.files.length === 2 && first.stamp, 'first read sends the list and a stamp');
ok(api.teamSongs_({ key: 'K', since: first.stamp }).same === true, 'same stamp: nothing to send');
// The listing runs out and is read again in another order: still the same.
store.clear(); drive = drive.slice().reverse();
const again = api.teamSongs_({ key: 'K', since: first.stamp });
ok(again.same === true && again.stamp === first.stamp, 'listing expired, Drive unchanged: still "same"');
// David replaces a PDF in Drive; no trigger yet, so the cached listing hides it.
drive[0] = { ...drive[0], size: '250', modifiedTime: '2026-11-14T00:00:00Z' };
ok(api.teamSongs_({ key: 'K', since: first.stamp }).same === true, 'before the trigger runs, a Drive change is not seen (the old behaviour)');
api.setupSongRefresh(); api.setupSongRefresh();
ok(triggers.length === 1 && triggers[0].n === 10, 'setupSongRefresh leaves exactly one 10-minute trigger');
const changed = api.teamSongs_({ key: 'K', since: first.stamp });
ok(!changed.same && changed.stamp !== first.stamp && changed.files.some((f) => f.size === 250), 'after the trigger runs, the changed PDF is sent');
const w = walks; api.refreshSongLibrary();
ok(walks > w && api.teamSongs_({ key: 'K', since: changed.stamp }).same === true, 'trigger runs again with no change: iPads still get "same"');
g.Drive.Files.list = () => { throw new Error('Drive busy'); };
api.refreshSongLibrary();
ok(api.teamSongs_({ key: 'K', since: changed.stamp }).same === true, 'a failed trigger run leaves the list as it was');
