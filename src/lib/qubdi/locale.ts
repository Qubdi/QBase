import { i18n } from '@/i18n/i18n';
import { localeTag } from '@/i18n/locale-tag';

/**
 * The chosen language as `Intl` wants it, for dates and times. `undefined`
 * (the browser's own default) only when the language has no valid code.
 */
export const uiLocale = (): string | undefined => localeTag(i18n.language);
