// Setup for the performance suite (vitest.perf.config.ts). It runs in plain
// Node, without the DOM and Testing Library setup of src/test/setup.ts: only
// the dialect type catalogue the app installs at start is needed.
import { provideDialectTypes } from '@/qbase/dialect-types';

provideDialectTypes();
