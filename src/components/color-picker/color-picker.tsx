import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/platform/ui/popover';
import { Button } from '@/platform/ui/button';
import { Input } from '@/platform/ui/input';
import { colorOptions } from '@/lib/colors';
import { normalizeHex } from '@/lib/custom-colors';
import { useCustomColors } from '@/hooks/use-custom-colors';
import { cn } from '@/lib/utils/utils';

export interface ColorPickerProps {
    color: string;
    onChange: (color: string) => void;
    disabled?: boolean;
    className?: string;
    /** Passed to the popover so the canvas does not start a drag. */
    popoverOnMouseDown?: React.MouseEventHandler<HTMLDivElement>;
}

const Swatch: React.FC<{
    color: string;
    current: string | null;
    onPick: (c: string) => void;
}> = ({ color, current, onPick }) => {
    const { t } = useTranslation();
    return (
        <button
            type="button"
            aria-label={t('editor.common.colorPicker.useColor', { color })}
            aria-pressed={current === color}
            className={cn(
                'size-6 rounded-full border border-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                current === color && 'ring-2 ring-ring ring-offset-1'
            )}
            style={{ backgroundColor: color }}
            onClick={() => onPick(color)}
        />
    );
};

export const ColorPicker: React.FC<ColorPickerProps> = ({
    color,
    onChange,
    disabled,
    className,
    popoverOnMouseDown,
}) => {
    const { t } = useTranslation();
    const [text, setText] = useState('');
    const { colors: saved, add, remove } = useCustomColors();
    const current = normalizeHex(color);
    const typed = normalizeHex(text);
    const invalid = text.trim() !== '' && typed === null;

    const applyTyped = () => {
        if (!typed) return;
        add(typed);
        onChange(typed);
        setText('');
    };

    return (
        <Popover>
            <PopoverTrigger asChild disabled={disabled}>
                <button
                    type="button"
                    aria-label={t('editor.common.colorPicker.change')}
                    disabled={disabled}
                    className={cn(
                        'size-6 rounded-md border border-black/10 disabled:opacity-50',
                        className
                    )}
                    style={{ backgroundColor: color }}
                />
            </PopoverTrigger>
            <PopoverContent
                className="w-60 space-y-3 p-3"
                onMouseDown={popoverOnMouseDown}
            >
                <div className="flex flex-wrap gap-2">
                    {colorOptions.map((c) => (
                        <Swatch
                            key={c}
                            color={c}
                            current={current}
                            onPick={onChange}
                        />
                    ))}
                </div>
                {saved.length > 0 ? (
                    <div
                        role="group"
                        aria-label={t('editor.common.colorPicker.yourColors')}
                        className="flex flex-wrap gap-2"
                    >
                        {saved.map((c) => (
                            <span key={c} className="group relative">
                                <Swatch
                                    color={c}
                                    current={current}
                                    onPick={onChange}
                                />
                                <button
                                    type="button"
                                    aria-label={t(
                                        'editor.common.colorPicker.remove',
                                        {
                                            color: c,
                                        }
                                    )}
                                    className="absolute -right-1 -top-1 hidden size-3.5 items-center justify-center rounded-full bg-background shadow group-hover:flex group-focus-within:flex"
                                    onClick={() => remove(c)}
                                >
                                    <X className="size-2.5" />
                                </button>
                            </span>
                        ))}
                    </div>
                ) : null}
                <form
                    className="space-y-1"
                    onSubmit={(e) => {
                        e.preventDefault();
                        applyTyped();
                    }}
                >
                    <div className="flex items-center gap-2">
                        <input
                            type="color"
                            aria-label={t(
                                'editor.common.colorPicker.pickCustom'
                            )}
                            className="size-8 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                            value={typed ?? current ?? '#000000'}
                            onChange={(e) => setText(e.target.value)}
                        />
                        <Input
                            aria-label={t('editor.common.colorPicker.hex')}
                            aria-invalid={invalid}
                            placeholder={t(
                                'editor.common.colorPicker.hexPlaceholder'
                            )}
                            className="h-8"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                        />
                        <Button type="submit" size="sm" disabled={!typed}>
                            {t('editor.common.colorPicker.use')}
                        </Button>
                    </div>
                    {invalid ? (
                        <p role="alert" className="text-xs text-destructive">
                            {t('editor.common.colorPicker.invalid')}
                        </p>
                    ) : null}
                </form>
            </PopoverContent>
        </Popover>
    );
};
