import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/platform/ui/input';
import { cn } from '@/lib/utils';

export type PasswordInputProps = Omit<React.ComponentProps<'input'>, 'type'>;

/**
 * A password input with an eye button that shows or hides what was typed.
 * It starts hidden, and goes back to hidden when the field is disabled.
 */
export const PasswordInput = React.forwardRef<
    HTMLInputElement,
    PasswordInputProps
>(({ className, disabled, ...props }, ref) => {
    const { t } = useTranslation();
    const [shown, setShown] = React.useState(false);
    const visible = shown && !disabled;
    const Icon = visible ? EyeOff : Eye;
    return (
        <div className="relative w-full">
            <Input
                {...props}
                ref={ref}
                disabled={disabled}
                type={visible ? 'text' : 'password'}
                className={cn('pr-10', className)}
            />
            <button
                type="button"
                disabled={disabled}
                aria-pressed={visible}
                // one fixed name; aria-pressed says whether the text is shown
                aria-label={t('qubdi.account.passwordField.show')}
                title={t('qubdi.account.passwordField.show')}
                // keep the caret in the field when the button is pressed
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShown((s) => !s)}
                className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
                <Icon className="size-4" aria-hidden />
            </button>
        </div>
    );
});
PasswordInput.displayName = 'PasswordInput';
