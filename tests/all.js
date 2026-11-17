// Every check: deno run --allow-read tests/all.js
import { done } from './harness.js';
await import('./matching_test.js');
await import('./stamp_test.js');
await import('./marks_test.js');
done();
