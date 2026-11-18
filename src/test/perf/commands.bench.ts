// Commands and undo: moving every table, one column edit and its undo, a session of 100 edits and undos, deleting tables with their undo.
// Run: npx vitest bench --config vitest.perf.config.ts
import { benchGroup } from './bench-group';

benchGroup('commands');
