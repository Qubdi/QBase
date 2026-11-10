import { afterEach, describe, expect, it } from 'vitest';
import { i18n } from '@/i18n/i18n';
import { exactTime } from '../when';
import { formatWhen } from '../diagram-summary';

describe('dates follow the chosen language, not the browser default', () => {
    afterEach(() => i18n.changeLanguage('en'));

    it('writes the same moment differently in English and German', async () => {
        const iso = '2026-03-04T15:05:00.000Z';
        await i18n.changeLanguage('en');
        const en = [exactTime(iso), formatWhen(iso)];
        await i18n.changeLanguage('de');
        const de = [exactTime(iso), formatWhen(iso)];
        expect(de[0]).not.toBe(en[0]);
        expect(de[1]).not.toBe(en[1]);
        expect(de[0]).toMatch(/4\.3\.2026|04\.03\.2026/);
    });
});
