// How a song on the order of service finds its PDF: reading a title out of a file
// name, deciding which Songs tab song a PDF belongs to, and picking the best PDF
// for the congregation. The songs and file names here are made up for the tests.
import { load, ok, same, section } from './harness.js';

const api = load({}, ['teamPdfTitle_', 'teamAllWords_', 'teamKeyWords_', 'teamOneEdit_', 'teamKeyFromName_', 'teamSongNames_',
  'teamRowFor_', 'teamOrderRow_', 'teamAutoRank_', 'teamBestPdf_', 'teamAutoSongs_', 'teamServiceSongs_']);

section('Reading a title from a PDF name');
same(api.teamPdfTitle_('06_All My Boast Is In Jesus-lead-G.pdf'), 'All My Boast Is In Jesus', 'a track number and "-lead-G" are dropped');
same(api.teamPdfTitle_('Come Christians Join To Sing_CCLI-G_4 Part.pdf'), 'Come Christians Join To Sing', 'everything after the first "_" is dropped');
same(api.teamPdfTitle_('all_i_have_is_christ_HYMN.pdf'), 'all i have is christ HYMN', 'a name with "_" for spaces is read as words');
same(api.teamPdfTitle_('Amazing Grace - Key of G.pdf'), 'Amazing Grace', '" - " ends the title');
same(api.teamPdfTitle_('It Is Well copy.pdf'), 'It Is Well', 'a trailing "copy" is dropped');

section('Words in a title');
same(api.teamAllWords_('O Come, All Ye Faithful (Adeste Fideles)'), ['o', 'come', 'all', 'ye', 'faithful'], 'punctuation and anything in parentheses go');
same(api.teamAllWords_('Christ’s Grace & Peace, Noël'), ['christs', 'grace', 'and', 'peace', 'noel'], 'apostrophes, "&" and accents');
same(api.teamKeyWords_(['o', 'the', 'deep', 'deep', 'love', 'of', 'jesus']), ['deep', 'deep', 'love', 'jesus'], 'small words are not key words');
ok(api.teamOneEdit_('womdrous', 'wondrous') && api.teamOneEdit_('grace', 'graces'), 'one letter changed or added is one edit');
ok(!api.teamOneEdit_('grace', 'place') && !api.teamOneEdit_('grace', 'gracious'), 'two letters apart is not');

section('The key in a PDF name');
[['How Great Thou Art_CCLI-G_4 Part', 'G'], ['In Christ Alone_Getty-D_Lead', 'D'], ['Song Title_Praise-Ab_Hymn', 'Ab'],
  ['Song Title_F_Lead', 'F'], ['Song Title (Bb)', 'Bb'], ['06_Song Title-lead-Dm', 'Dm'], ['Song Title_Key of Eb', 'Eb'],
  ['Living Hope_4 Part', ''], ['Amazing Grace', '']].forEach(([name, key]) => {
  same(api.teamKeyFromName_(name + '.pdf'), key, '"' + name + '" -> ' + (key || 'no key'));
});

// A small Songs tab.
const rows = [
  { id: 's1', num: '43', title: 'Rejoice, the Lord Is King', other: '' },
  { id: 's2', num: '', title: 'It Is Well With My Soul', other: 'When Peace Like a River' },
  { id: 's3', num: '', title: 'Behold the Lamb (Communion Hymn)', other: '' },
  { id: 's4', num: '', title: 'O the Deep, Deep Love of Jesus', other: '' },
  { id: 's5', num: '100', title: 'Amazing Grace', other: '' },
  { id: 's6', num: '200', title: 'Amazing Grace', other: '' },
  { id: 's7', num: '', title: 'How Great Thou Art', other: '' },
  { id: 's8', num: '', title: 'Amazing Grace My Chains Are Gone', other: '' },
];
const names = api.teamSongNames_(rows);
const owner = (file) => { const r = api.teamRowFor_(file, names).row; return r ? r.id : null; };

section('Which song a PDF belongs to');
same(owner('Rejoice the Lord Is King_CCLI-C_4 Part.pdf'), 's1', 'the same title, punctuation aside');
same(owner('When Peace Like a River_Hymn.pdf'), 's2', 'a song’s other name');
same(owner('It Is Well_4 Part.pdf'), 's2', 'a title that starts the song’s title, three words or more');
same(owner('Oh the Deep Deep Love of Jesis_Lead.pdf'), 's4', 'a typo in a long word, and "Oh" for "O"');
same(owner('How Great Thou Are.pdf'), null, 'a different short word is a different song');
same(owner('Behold the Lamb_Getty-D.pdf'), 's3', 'a versioned title still matches its own words');
same(owner('Behold the Lamb of God_4 Part.pdf'), null, 'a versioned title does not take longer titles');
same(owner('Amazing Grace_4 Part.pdf'), 's5', 'two songs with one title: the first on the Songs tab');
same(owner('Living Hope_CCLI-C_4 Part.pdf'), null, 'a song that is not on the Songs tab');
same(api.teamRowFor_('Living Hope_CCLI-C_4 Part.pdf', names).key, ['living', 'hope'], 'it still gets its key words, for the library');

section('Which Songs tab song an order line means');
const line = (num, title) => { const r = api.teamOrderRow_({ num, title }, rows); return r ? r.id : null; };
same(line('', 'Rejoice the Lord is King'), 's1', 'by title');
same(line('', 'When Peace Like a River'), 's2', 'by another name');
same(line('200', 'Amazing Grace'), 's6', 'two songs share a title: the hymn number decides');
same(line('', 'Amazing Grace'), 's5', 'and with no number, the first');
same(line('43', 'Rejoice, Lord Is King'), 's1', 'by number when the title nearly agrees');
same(line('43', 'Amazing Love'), null, 'a number whose song has another title is not trusted');
same(line('43', ''), 's1', 'a number alone');
same(line('', 'Something Never Sung'), null, 'no such song');

section('The best PDF for the congregation');
const cong = 'Congregational Music / Congregational_New';
const files = [
  { id: 'f1', name: 'Living Hope_CCLI-C_4 Part.pdf', folder: cong, modified: '2026-01-01' },
  { id: 'f2', name: 'Living Hope_CCLI-C_4 Part_Abbreviated.pdf', folder: cong, modified: '2026-03-01' },
  { id: 'f3', name: 'Living Hope_CCLI-C_Lead.pdf', folder: cong, modified: '2026-03-01' },
  { id: 'f4', name: 'Living Hope_4 Part.pdf', folder: 'SATB', modified: '2026-03-01' },
  { id: 'f5', name: 'Amazing Grace_CCLI-G_4 Part.pdf', folder: cong, modified: '2026-03-01' },
  { id: 'f6', name: 'Amazing Grace_4 Part.pdf', folder: cong, modified: '2026-01-01' },
  { id: 'f7', name: 'Amazing Grace_4 Part.pdf', folder: cong, modified: '2026-02-01' },
  { id: 'f8', name: 'Hope Medley_4 Part.pdf', folder: cong, modified: '2026-04-01' },
];
const context = (extra) => {
  const index = {};
  files.forEach((f) => { index[f.id] = f; });
  return { rows, names, picks: {}, index, songOf: {}, files, owners: {}, ...extra };
};
ok(api.teamAutoRank_(files[0]) > api.teamAutoRank_(files[1]) && api.teamAutoRank_(files[1]) > api.teamAutoRank_(files[2]),
  '4-part before its abbreviated copy, both before a lead sheet');
same(api.teamBestPdf_('t:living hope', ['living', 'hope'], context()).id, 'f1', 'a song with no Songs tab row: the plain 4-part, never the SATB folder');
same(api.teamBestPdf_('s5', ['amazing', 'grace'], context()).id, 'f7', 'no key in the name wins (the original key); of two alike, the newer');
same(api.teamBestPdf_('s7', ['how', 'great', 'thou', 'art'], context()), null, 'a song with no PDF');
same(api.teamBestPdf_('t:living hope', ['living', 'hope'], context({ songOf: { f8: 't:living hope' } })).id, 'f8',
  'a PDF an iPad added for the song counts as that song’s');

section('A service’s songs, linked automatically');
const order = [{ num: '', title: 'Living Hope' }, { num: '', title: 'Something Never Sung' }, { num: '100', title: 'Amazing Grace' }];
let missing = [];
let songs = api.teamAutoSongs_(order, context(), missing);
same(songs.map((s) => [s.title, s.file, s.song, s.auto]), [['Living Hope', 'f1', 't:living hope', true], ['Amazing Grace', 'f7', 's5', true]],
  'each song gets its PDF and its library key');
same(missing, [{ title: 'Something Never Sung', song: 't:something never sung', after: 1 }], 'a song with no PDF is listed as missing, with its place');
songs = api.teamAutoSongs_(order, context({ picks: { s5: 'f5|2,3', 't:living hope': 'gone' } }), []);
same([songs[1].file, songs[1].pages], ['f5', [2, 3]], 'the PDF and pages picked on the packet page last time come first');
same(songs[0].file, 'f1', 'a remembered pick whose PDF is gone falls back to the best one');

section('The songs of a service');
const svc = { items: [{ role: 'Song 1', value: '43 Rejoice the Lord Is King' }, { role: 'Song 2', value: '*New* Living Hope' },
  { role: 'Pianist', value: 'Somebody' }, { role: 'Closing', value: '' }] };
same(api.teamServiceSongs_(svc, null), [{ num: '43', title: 'Rejoice the Lord Is King' }, { num: '', title: 'Living Hope' }],
  'from the schedule: the number is split off and "*New*" dropped');
same(api.teamServiceSongs_(svc, { view: { items: [{ song: true, num: 100, title: 'Amazing Grace' }, { song: false, title: 'Prayer' }] } }),
  [{ num: '100', title: 'Amazing Grace' }], 'a saved order of service comes first');
