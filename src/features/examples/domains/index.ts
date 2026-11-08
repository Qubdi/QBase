import { domain as clinic } from './clinic';
import { domain as bookshop } from './bookshop';
import { domain as library } from './library';
import { domain as habits } from './habits';
import { domain as hotel } from './hotel';
import { domain as airline } from './airline';
import { domain as delivery } from './delivery';
import { domain as analytics } from './analytics';
import type { Domain } from '../spec';

/** The eight examples, one for each database, in the order the examples list shows them. */
export const DOMAINS: readonly Domain[] = [
    clinic,
    bookshop,
    library,
    habits,
    hotel,
    airline,
    delivery,
    analytics,
];
