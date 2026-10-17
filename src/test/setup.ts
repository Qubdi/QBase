import '@testing-library/jest-dom';
import { expect, afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

// `findBy...` and `waitFor` give up after one second by default. A full run has a
// worker per core, and a page that loads its data in two steps (the name, then
// the list under it) can take longer than that on a busy machine. Waiting
// longer costs nothing when the thing is there; it only matters when it is not.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
    cleanup();
});
