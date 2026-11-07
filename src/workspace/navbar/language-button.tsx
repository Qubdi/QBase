import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Globe } from 'lucide-react';
import { Button } from '@/platform/ui/button';
import { SearchInput } from '@/components/qubdi/search-input';
import { Popover, PopoverContent, PopoverTrigger } from '@/platform/ui/popover';
import { languages } from '@/i18n/languages';

/** "Français (French)": the native name, with the English one in brackets when it differs. */
const labelOf = (l: { name: string; nativeName: string }) =>
    l.name === l.nativeName ? l.nativeName : `${l.nativeName} (${l.name})`;

/** The language picker at the right end of the navbar: a searchable list. */
export const LanguageButton: React.FC = () => {
    const { t, i18n } = useTranslation();
    const [open, setOpen] = useState(false);
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
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next) setSearch('');
            }}
        >
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('editor.workspace.navbar.language')}
                >
                    <Globe />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                aria-label={t('editor.workspace.navbar.language')}
                className="max-h-80 w-56 overflow-auto p-1"
            >
                <div className="p-1">
                    <SearchInput
                        value={search}
                        onChange={setSearch}
                        placeholder={t(
                            'editor.workspace.navbar.searchLanguage'
                        )}
                    />
                </div>
                <div
                    role="radiogroup"
                    aria-label={t('editor.workspace.navbar.language')}
                >
                    {shown.map((l) => (
                        <button
                            key={l.code}
                            type="button"
                            role="radio"
                            aria-checked={l.code === current}
                            onClick={() => {
                                void i18n.changeLanguage(l.code);
                                setOpen(false);
                            }}
                            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-start text-sm hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none"
                        >
                            <span className="flex size-4 items-center justify-center">
                                {l.code === current ? (
                                    <Check className="size-4" />
                                ) : null}
                            </span>
                            {labelOf(l)}
                        </button>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
};
