// Schema lint (shared with the server and CLI), with and without projecting the design, and the drift reconcile.
// Run: npx vitest bench --config vitest.perf.config.ts
import { benchGroup } from './bench-group';

benchGroup('lint');
