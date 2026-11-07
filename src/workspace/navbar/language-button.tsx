import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { Button } from '@/platform/ui/button';
import { SearchInput } from '@/components/qubdi/search-input';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from '@/platform/ui/dropdown-menu';
import { languages } from '@/i18n/languages';

/** "Français (French)": the native name, with the English one in brackets when it differs. */
const labelOf = (l: { name: string; nativeName: string }) =>
    l.name === l.nativeName ? l.nativeName : `${l.nativeName} (${l.name})`;

/** The language picker at the right end of the navbar: a searchable list. */
export const LanguageButton: React.FC = () => {
    const { t, i18n } = useTranslation();
    const [search, setSearch] = useState('');
    const needle = search.trim().toLowerCase();
    const shown = languages.filter(
        (l) =>
            needle === '' ||
            l.name.toLowerCase().includes(needle) ||
            l.nativeName.toLowerCase().includes(needle)
    );
    const current =
        languages.find((l) => i18n.language === l.code)?.code ??
        languages.find((l) => i18n.language?.startsWith(l.code))?.code ??
        'en';
    return (
        <DropdownMenu onOpenChange={(open) => open && setSearch('')}>
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
                {/* typing here must not be taken for the menu's own type-ahead */}
                <div
                    role="presentation"
                    onKeyDown={(e) => e.stopPropagation()}
                    className="p-1"
                >
                    <SearchInput
                        value={search}
                        onChange={setSearch}
                        placeholder={t(
                            'editor.workspace.navbar.searchLanguage'
                        )}
                    />
                </div>
                <DropdownMenuRadioGroup
                    value={current}
                    onValueChange={(code) => void i18n.changeLanguage(code)}
                >
                    {shown.map((l) => (
                        <DropdownMenuRadioItem key={l.code} value={l.code}>
                            {labelOf(l)}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
