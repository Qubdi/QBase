// SQL import (every dialect's reader and the design builder) and SQL export (same-family writers and the cross-dialect converter).
// Run: npx vitest bench --config vitest.perf.config.ts
import { benchGroup } from './bench-group';

benchGroup('sql');
