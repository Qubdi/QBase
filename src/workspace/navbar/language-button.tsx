import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { Button } from '@/platform/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from '@/platform/ui/dropdown-menu';
import { languages } from '@/i18n/languages';

/** The language picker at the right end of the navbar. */
export const LanguageButton: React.FC = () => {
    const { t, i18n } = useTranslation();
    const current =
        languages.find((l) => i18n.language === l.code)?.code ??
        languages.find((l) => i18n.language?.startsWith(l.code))?.code ??
        'en';
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('editor.workspace.navbar.language')}
                >
                    <Globe />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-auto">
                <DropdownMenuRadioGroup
                    value={current}
                    onValueChange={(code) => void i18n.changeLanguage(code)}
                >
                    {languages.map((l) => (
                        <DropdownMenuRadioItem key={l.code} value={l.code}>
                            {l.nativeName}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
