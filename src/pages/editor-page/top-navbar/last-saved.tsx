import React, { useEffect, useState } from 'react';
import { useDiagram } from '@/hooks/use-diagram';
import { useTranslation } from 'react-i18next';
import type { LocaleFunc } from 'timeago.js';
import { format, register as registerLocale } from 'timeago.js';
import { Save } from 'lucide-react';

export interface LastSavedProps {}

const timeAgolocaleFromLanguage = async (
    language: string
): Promise<{ locale: LocaleFunc; lang: string }> => {
    let locale: LocaleFunc;
    let lang: string;
    switch (language) {
        case 'es':
            locale = (await import('timeago.js/lib/lang/es')).default;
            lang = 'es';
            break;
        case 'fr':
            locale = (await import('timeago.js/lib/lang/fr')).default;
            lang = 'fr';
            break;
        case 'de':
            locale = (await import('timeago.js/lib/lang/de')).default;
            lang = 'de';
            break;
        case 'hi':
            locale = (await import('timeago.js/lib/lang/hi_IN')).default;
            lang = 'hi_IN';
            break;
        case 'ja':
            locale = (await import('timeago.js/lib/lang/ja')).default;
            lang = 'ja';
            break;
        case 'ko_KR':
            locale = (await import('timeago.js/lib/lang/ko')).default;
            lang = 'ko';
            break;
        case 'ru':
            locale = (await import('timeago.js/lib/lang/ru')).default;
            lang = 'ru';
            break;
        case 'zh_CN':
            locale = (await import('timeago.js/lib/lang/zh_CN')).default;
            lang = 'zh_CN';
            break;
        case 'zh_TW':
            locale = (await import('timeago.js/lib/lang/zh_TW')).default;
            lang = 'zh_TW';
            break;
        case 'pt_BR':
            locale = (await import('timeago.js/lib/lang/pt_BR')).default;
            lang = 'pt_BR';
            break;
        case 'bn':
            locale = (await import('timeago.js/lib/lang/bn_IN')).default;
            lang = 'bn';
            break;
        default:
            locale = (await import('timeago.js/lib/lang/en_US')).default;
            lang = 'en_US';
            break;
    }
    return { locale, lang };
};

export const LastSaved: React.FC<LastSavedProps> = () => {
    const { currentDiagram } = useDiagram();
    const { i18n } = useTranslation();
    const [language, setLanguage] = useState<string>('en_US');

    useEffect(() => {
        const updateLocale = async () => {
            const { locale, lang } = await timeAgolocaleFromLanguage(
                i18n.language
            );

            registerLocale(i18n.language, locale);
            setLanguage(lang);
        };

        updateLocale();
    }, [i18n.language]);

    const savedAgo = `Saved ${format(currentDiagram.updatedAt, language)}`;

    return (
        <span
            role="img"
            aria-label={savedAgo}
            title={`${savedAgo}\n${currentDiagram.updatedAt.toLocaleString()}`}
            tabIndex={0}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground"
        >
            <Save className="size-4" />
        </span>
    );
};
