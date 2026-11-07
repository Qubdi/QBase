import React, { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/platform/ui/button';
import { Checkbox } from '@/platform/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/platform/ui/dialog';
import { Label } from '@/platform/ui/label';
import { OptionSelect } from '@/components/option-select/option-select';
import { LocalConfigContext } from '@/context/local-config-context/local-config-context';
import type { ScrollAction } from '@/context/local-config-context/local-config-context';
import { languages } from '@/i18n/languages';
import type { Theme } from '@/platform/theme/theme-utils';
import '@/i18n/editor/register';

export interface ShortcutRow {
    label: string;
    keys: string;
}

export interface SettingsDialogProps {
    open: boolean;
    onClose: () => void;
    /** the keyboard reference shown under the settings */
    shortcuts: readonly ShortcutRow[];
}

/**
 * The view settings in one place (spec A10): theme, language, scroll wheel
 * and the canvas toggles, all on the local configuration. Each change applies
 * and is saved at once.
 */
export const SettingsDialog: React.FC<SettingsDialogProps> = ({
    open,
    onClose,
    shortcuts,
}) => {
    const { t, i18n } = useTranslation();
    const config = useContext(LocalConfigContext);

    const toggles: {
        id: string;
        label: string;
        checked: boolean;
        set: (v: boolean) => void;
    }[] = [
        {
            id: 'cardinality',
            label: t('editor.settings.cardinality'),
            checked: config.showCardinality,
            set: config.setShowCardinality,
        },
        {
            id: 'attributes',
            label: t('editor.settings.fieldAttributes'),
            checked: config.showFieldAttributes,
            set: config.setShowFieldAttributes,
        },
        {
            id: 'compact',
            label: t('editor.settings.compactTables'),
            checked: config.compactTables,
            set: config.setCompactTables,
        },
        {
            id: 'minimap',
            label: t('editor.settings.minimap'),
            checked: config.showMinimap,
            set: config.setShowMinimap,
        },
        {
            id: 'views',
            label: t('editor.settings.views'),
            checked: config.showDbViews,
            set: config.setShowDbViews,
        },
    ];

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="max-h-[90dvh] max-w-lg overflow-auto">
                <DialogHeader>
                    <DialogTitle>{t('editor.settings.title')}</DialogTitle>
                    <DialogDescription>
                        {t('editor.settings.description')}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3">
                    <Label>{t('editor.settings.theme')}</Label>
                    <OptionSelect
                        aria-label={t('editor.settings.theme')}
                        size="sm"
                        value={config.theme}
                        onValueChange={(v) => config.setTheme(v as Theme)}
                        options={(['system', 'light', 'dark'] as const).map(
                            (v) => ({
                                value: v,
                                label: t(`editor.settings.themes.${v}`),
                            })
                        )}
                    />
                    <Label>{t('editor.settings.language')}</Label>
                    <OptionSelect
                        aria-label={t('editor.settings.language')}
                        size="sm"
                        value={
                            languages.find((l) =>
                                i18n.language?.startsWith(l.code)
                            )?.code ?? 'en'
                        }
                        onValueChange={(code) => void i18n.changeLanguage(code)}
                        options={languages.map((l) => ({
                            value: l.code,
                            label: l.nativeName,
                        }))}
                    />
                    <Label>{t('editor.settings.wheel')}</Label>
                    <OptionSelect
                        aria-label={t('editor.settings.wheel')}
                        size="sm"
                        value={config.scrollAction}
                        onValueChange={(v) =>
                            config.setScrollAction(v as ScrollAction)
                        }
                        options={(['pan', 'zoom'] as const).map((v) => ({
                            value: v,
                            label: t(`editor.settings.wheelModes.${v}`),
                        }))}
                    />
                </div>

                <div className="flex flex-col gap-2">
                    {toggles.map((row) => (
                        <div key={row.id} className="flex items-center gap-2">
                            <Checkbox
                                id={`setting-${row.id}`}
                                checked={row.checked}
                                onCheckedChange={(v) => row.set(v === true)}
                            />
                            <Label htmlFor={`setting-${row.id}`}>
                                {row.label}
                            </Label>
                        </div>
                    ))}
                </div>

                <section aria-label={t('editor.settings.shortcuts')}>
                    <h3 className="mb-2 text-sm font-medium">
                        {t('editor.settings.shortcuts')}
                    </h3>
                    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                        {shortcuts.map((s) => (
                            <React.Fragment key={s.label}>
                                <dt className="text-muted-foreground">
                                    {s.label}
                                </dt>
                                <dd className="font-mono text-xs">{s.keys}</dd>
                            </React.Fragment>
                        ))}
                    </dl>
                </section>

                <DialogFooter>
                    <Button onClick={onClose}>
                        {t('editor.common.close')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
