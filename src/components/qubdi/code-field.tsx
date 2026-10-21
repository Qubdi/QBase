import React from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/input/input';

export interface CodeFieldProps {
    value: string;
    onChange: (value: string) => void;
    /** a recovery code is letters and a dash, not six digits */
    recovery?: boolean;
    /** takes either kind: the box where it does not matter which one is typed */
    either?: boolean;
    placeholder?: string;
    autoFocus?: boolean;
    label?: string;
}

/**
 * Where a second factor is typed. For an authenticator code the phone's number
 * pad opens and the browser or phone may offer the code it received
 * (`one-time-code`); a recovery code is plain text.
 */
export const CodeField: React.FC<CodeFieldProps> = ({
    value,
    onChange,
    recovery = false,
    either = false,
    placeholder,
    autoFocus,
    label,
}) => {
    const { t } = useTranslation();
    return (
        <Input
            type="text"
            name={recovery ? 'recovery-code' : 'one-time-code'}
            aria-label={
                label ??
                (recovery
                    ? t('qubdi.account.codeField.recoveryLabel')
                    : t('qubdi.account.codeField.authenticatorLabel'))
            }
            placeholder={
                placeholder ??
                (recovery
                    ? t('qubdi.account.codeField.recoveryPlaceholder')
                    : t('qubdi.account.codeField.digitsPlaceholder'))
            }
            autoComplete={recovery ? 'off' : 'one-time-code'}
            inputMode={recovery || either ? 'text' : 'numeric'}
            pattern={recovery || either ? undefined : '[0-9 ]*'}
            maxLength={recovery || either ? 20 : 7}
            autoCapitalize={recovery ? 'characters' : 'off'}
            spellCheck={false}
            autoFocus={autoFocus}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required
        />
    );
};
