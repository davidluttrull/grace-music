// Loads Code.gs outside Google so its logic can be checked on the Mac:
//
//   deno run --allow-read tests/all.js
//
// Each test hands Code.gs stand-ins for the Google services it uses (the Sheet,
// Drive, Script Properties) and calls its functions directly. Nothing here talks
// to Google or holds a code or key.

const source = Deno.readTextFileSync(new URL('../Code.gs', import.meta.url));

/** Code.gs with these stand-ins as its globals; answers the named functions. */
export function load(globals, names) {
  const g = { console, ...globals };
  return new Function(...Object.keys(g), source + '\nreturn { ' + names.join(', ') + ' };')(...Object.values(g));
}

let failed = 0;
export function section(title) { console.log('\n' + title); }
export function ok(condition, what) {
  console.log((condition ? '  PASS ' : '  FAIL ') + what);
  if (!condition) { failed++; Deno.exitCode = 1; }
}
export function same(got, want, what) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  ok(a === b, a === b ? what : what + '\n         got  ' + a + '\n         want ' + b);
}
export function threw(f) { try { f(); return false; } catch (_) { return true; } }
export function done() { console.log(failed ? '\n' + failed + ' failed' : '\nAll passed'); }
