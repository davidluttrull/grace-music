// Pencil marks shared between the iPads: saving, asking what's new, fetching, and two iPads saving at once.
import { load, ok, section, threw } from './harness.js';
section('Pencil marks');
const props = new Map([['TEAM_KEY', 'K']]);
const store = new Map();
const files = new Map(); let nextId = 1, folders = 0;
let rows = null;   // the Pencil Marks tab, header included
const sheet = {
  getLastRow: () => rows.length,
  getRange: (r, c, n, w) => ({
    getValues: () => rows.slice(r - 1, r - 1 + n).map((x) => x.slice(c - 1, c - 1 + w)),
    setValues: (v) => { v.forEach((x, i) => { rows[r - 1 + i] = x.slice(); }); return { setFontWeight: () => {} }; },
  }),
  appendRow: (v) => rows.push(v.slice()), setFrozenRows: () => {},
};
const ss = { getSheetByName: (n) => (n === 'Pencil Marks' && rows ? sheet : null), getNumSheets: () => 3,
  insertSheet: () => { rows = [[]]; return sheet; } };
const g = {
  CacheService: { getScriptCache: () => ({ get: (k) => store.get(k) ?? null, put: (k, v) => store.set(k, v) }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ss },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v),
    getProperties: () => Object.fromEntries(props) }) },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  DriveApp: {
    createFolder: () => { folders++; return { getId: () => 'folder1', isTrashed: () => false,
      createFile: (name, data) => { const id = 'drive' + nextId++; files.set(id, data); return { getId: () => id }; } }; },
    getFolderById: () => ({ isTrashed: () => false, getId: () => 'folder1',
      createFile: (name, data) => { const id = 'drive' + nextId++; files.set(id, data); return { getId: () => id }; } }),
    getFileById: (id) => { if (!files.has(id)) throw new Error('gone'); return { getBlob: () => ({ getDataAsString: () => files.get(id) }), setContent: (d) => files.set(id, d) }; },
  },
  Session: { getScriptTimeZone: () => 'America/Indiana/Indianapolis' }, Utilities: {}, ScriptApp: {}, Drive: {},
};
const api = load(g, ['teamMarks_', 'teamMarkGet_', 'teamMarkPut_', 'teamPerson_']);
const F = 'abcdefghij1234567890', P = 'p-dave-luttrull';

ok(api.teamMarks_({ key: 'bad', layers: {} }).status === 'badkey', 'a wrong key is refused');
const empty = api.teamMarks_({ key: 'K', layers: { team: 0 } });
ok(empty.status === 'ok' && empty.rev === 0 && empty.changes.length === 0 && rows === null, 'nothing saved yet: no changes, and no tab is made by asking');
const who = api.teamPerson_({ key: 'K', name: '  Dave   Luttrull ' });
ok(who.id === P && who.people.length === 1 && who.people[0].name === 'Dave Luttrull', 'a name is added and gets its id');
ok(api.teamPerson_({ key: 'K', name: 'dave luttrull' }).people.length === 1, 'the same name twice is one person');
ok(threw(() => api.teamPerson_({ key: 'K', name: ' !! ' })), 'an empty name is refused');

const a = api.teamMarkPut_({ key: 'K', layer: 'team', file: F, page: 2, data: '{"v":1}', base: 0, device: 'iPad 1' });
ok(a.rev === 1 && !a.conflict && folders === 1 && rows.length === 2, 'first save: rev 1, the folder and the tab are made');
const b = api.teamMarkPut_({ key: 'K', layer: P, file: F, page: 2, data: '{"mine":1}', base: 0 });
ok(b.rev === 2 && folders === 1 && rows.length === 3, 'another layer on the same page is its own row');
const news = api.teamMarks_({ key: 'K', layers: { team: 0 } });
ok(news.rev === 2 && news.changes.length === 1 && news.changes[0].layer === 'team' && news.changes[0].rev === 1, 'an iPad only hears about the layers it asked for');
ok(api.teamMarks_({ key: 'K', layers: { team: 2, [P]: 2 } }).changes.length === 0, 'up to date: no changes');
ok(api.teamMarks_({ key: 'K', layers: { team: 1, [P]: 1 } }).changes.length === 1, 'each layer is compared with its own number');
ok(api.teamMarks_({ key: 'K', layers: { team: 99 } }).changes.length === 1, 'a number newer than the server starts over');
const got = api.teamMarkGet_({ key: 'K', items: [{ layer: 'team', file: F, page: 2 }, { layer: P, file: F, page: 2 }, { layer: 'team', file: F, page: 9 }] });
ok(got.marks.length === 2 && got.marks[0].data === '{"v":1}' && got.marks[1].rev === 2, 'get sends the pages that exist');
const c = api.teamMarkPut_({ key: 'K', layer: 'team', file: F, page: 2, data: '{"v":2}', base: 1 });
ok(c.rev === 3 && rows.length === 3 && files.size === 2, 'saving again with the right base updates the same row and file');
const d = api.teamMarkPut_({ key: 'K', layer: 'team', file: F, page: 2, data: '{"v":"stale"}', base: 1 });
ok(d.conflict === true && d.rev === 3 && d.data === '{"v":2}' && [...files.values()].indexOf('{"v":"stale"}') < 0, 'a stale base writes nothing and sends back what is there');
const e = api.teamMarkPut_({ key: 'K', layer: 'team', file: F, page: 2, data: '{"v":"merged"}', base: d.rev });
ok(e.rev === 4 && api.teamMarkGet_({ key: 'K', items: [{ layer: 'team', file: F, page: 2 }] }).marks[0].data === '{"v":"merged"}', 'sending again on the new base saves');
files.delete(rows[1][4]);
const f = api.teamMarkPut_({ key: 'K', layer: 'team', file: F, page: 2, data: '{"v":5}', base: 0 });
ok(f.rev === 5 && rows.length === 3 && files.get(rows[1][4]) === '{"v":5}', 'a file deleted in Drive is made again in the same row');
ok(threw(() => api.teamMarkPut_({ key: 'K', layer: 'p-Bad Name', file: F, page: 1, data: '{}' })), 'a bad layer is refused');
ok(threw(() => api.teamMarkPut_({ key: 'K', layer: 'team', file: '../x', page: 1, data: '{}' })), 'a bad file id is refused');
ok(threw(() => api.teamMarkPut_({ key: 'K', layer: 'team', file: F, page: 0, data: '{}' })), 'page 0 is refused');
ok(threw(() => api.teamMarkPut_({ key: 'K', layer: 'team', file: F, page: 1, data: 'x'.repeat(10) })), 'data that is not JSON is refused');
ok(threw(() => api.teamMarkPut_({ key: 'K', layer: 'team', file: F, page: 1, data: '{' + 'x'.repeat(1500000) })), 'oversized marks are refused');
