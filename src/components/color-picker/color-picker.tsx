import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/button/button';
import { Input } from '@/components/input/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/popover/popover';
import { useCustomColors } from '@/hooks/use-custom-colors';
import { colorOptions } from '@/lib/colors';
import { normalizeHex } from '@/lib/custom-colors';
import { cn } from '@/lib/utils';

export interface ColorPickerProps {
    color: string;
    onChange: (color: string) => void;
    disabled?: boolean;
    popoverOnMouseDown?: (e: React.MouseEvent) => void;
    popoverOnClick?: (e: React.MouseEvent) => void;
}

const swatch =
    'size-8 cursor-pointer rounded-md border-2 border-muted transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const Swatch: React.FC<{
    color: string;
    current: boolean;
    onPick: () => void;
}> = ({ color, current, onPick }) => (
    <button
        type="button"
        aria-label={`Use ${color}`}
        aria-pressed={current}
        title={color}
        className={cn(swatch, current && 'border-foreground')}
        style={{ backgroundColor: color }}
        onClick={onPick}
    />
);

export const ColorPicker = React.forwardRef<
    React.ElementRef<typeof PopoverTrigger>,
    ColorPickerProps
>(({ color, onChange, disabled, popoverOnMouseDown, popoverOnClick }, ref) => {
    const { colors: mine, add, remove } = useCustomColors();
    const [draft, setDraft] = useState('');
    const current = normalizeHex(color) ?? color.toLowerCase();
    const parsed = normalizeHex(draft);
    const invalid = draft.trim() !== '' && parsed === null;

    // a color of your own is applied and kept for next time
    const applyCustom = () => {
        if (!parsed) return;
        onChange(parsed);
        add(parsed);
        setDraft('');
    };

    return (
        <Popover>
            <PopoverTrigger
                asChild
                ref={ref}
                disabled={disabled}
                {...(disabled ? { onClick: (e) => e.preventDefault() } : {})}
            >
                <div
                    role="button"
                    aria-label="Change color"
                    aria-disabled={disabled}
                    className={cn(
                        'h-6 w-8 cursor-pointer rounded-md border-2 border-muted transition-shadow hover:shadow-md',
                        {
                            'hover:shadow-none cursor-default': disabled,
                        }
                    )}
                    style={{
                        backgroundColor: color,
                    }}
                />
            </PopoverTrigger>
            <PopoverContent
                className="w-64"
                onMouseDown={popoverOnMouseDown}
                onClick={popoverOnClick}
            >
                <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-6 gap-2">
                        {colorOptions.map((option) => (
                            <Swatch
                                key={option}
                                color={option}
                                current={current === option}
                                onPick={() => onChange(option)}
                            />
                        ))}
                    </div>

                    {mine.length > 0 ? (
                        <div className="flex flex-col gap-1.5">
                            <p className="text-xs font-medium text-muted-foreground">
                                Your colors
                            </p>
                            <div
                                className="grid grid-cols-6 gap-2"
                                aria-label="Your colors"
                                role="group"
                            >
                                {mine.map((c) => (
                                    <div key={c} className="group relative">
                                        <Swatch
                                            color={c}
                                            current={current === c}
                                            onPick={() => onChange(c)}
                                        />
                                        <button
                                            type="button"
                                            aria-label={`Remove ${c}`}
                                            className="absolute -right-1 -top-1 hidden size-4 items-center justify-center rounded-full border bg-background text-muted-foreground hover:text-foreground focus-visible:flex group-hover:flex"
                                            onClick={() => remove(c)}
                                        >
                                            <X className="size-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    <form
                        className="flex flex-col gap-1.5"
                        onSubmit={(e) => {
                            e.preventDefault();
                            applyCustom();
                        }}
                    >
                        <p className="text-xs font-medium text-muted-foreground">
                            Custom color
                        </p>
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                aria-label="Pick a custom color"
                                className="size-8 shrink-0 cursor-pointer rounded-md border-2 border-muted bg-transparent p-0"
                                value={parsed ?? current}
                                onChange={(e) => setDraft(e.target.value)}
                            />
                            <Input
                                aria-label="Hex color"
                                aria-invalid={invalid}
                                placeholder="#8eb7ff"
                                maxLength={7}
                                spellCheck={false}
                                className={cn(
                                    'h-8 font-mono',
                                    invalid &&
                                        'border-destructive focus-visible:ring-destructive/30'
                                )}
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                            />
                            <Button type="submit" size="sm" disabled={!parsed}>
                                Use
                            </Button>
                        </div>
                        {invalid ? (
                            <p
                                role="alert"
                                className="text-xs text-destructive"
                            >
                                Enter a color like #8eb7ff.
                            </p>
                        ) : null}
                    </form>
                </div>
            </PopoverContent>
        </Popover>
    );
});

ColorPicker.displayName = 'ColorPicker';
