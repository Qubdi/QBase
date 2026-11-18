import React from 'react';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
    checkPassword,
    normalizeMinLength,
    passwordRules,
    type PasswordRuleId,
} from '../../../shared/password';
import { PasswordInput } from './password-input';

export interface PasswordFieldProps {
    value: string;
    onChange: (value: string) => void;
    /** the server's minimum length, from `usePasswordMinLength` */
    minLength: number;
    /** the account's email: the password may not contain it */
    email?: string;
    placeholder?: string;
    autoFocus?: boolean;
}

/**
 * A password input for choosing a password, with a checklist that ticks off
 * each rule as it is met. The server checks the same rules with the same
 * function; this is only so nobody has to guess what is missing.
 */
export const PasswordField: React.FC<PasswordFieldProps> = ({
    value,
    onChange,
    minLength,
    email,
    placeholder,
    autoFocus,
}) => {
    const { t } = useTranslation();
    const label = placeholder ?? t('qubdi.account.passwordField.placeholder');
    const rules = passwordRules({ minLength, email });
    const broken = new Set<PasswordRuleId>(
        checkPassword(value, { minLength, email })
    );
    const listId = React.useId();

    return (
        <div className="flex flex-col gap-2">
            <PasswordInput
                placeholder={label}
                aria-label={label}
                aria-describedby={listId}
                autoComplete="new-password"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- passes the caller's choice through
                autoFocus={autoFocus}
                required
            />
            <ul
                id={listId}
                aria-label={t('qubdi.account.passwordField.rules')}
                className="flex flex-col gap-0.5 text-xs"
            >
                {rules.map((rule) => {
                    const met = !broken.has(rule.id);
                    return (
                        <li
                            key={rule.id}
                            className={cn(
                                'flex items-center gap-1.5',
                                met
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-muted-foreground'
                            )}
                        >
                            {met ? (
                                <Check
                                    className="size-3.5 shrink-0"
                                    aria-hidden
                                />
                            ) : (
                                <X className="size-3.5 shrink-0" aria-hidden />
                            )}
                            {t(`qubdi.account.passwordField.rule.${rule.id}`, {
                                length: normalizeMinLength(minLength),
                                defaultValue: rule.label,
                            })}
                            <span className="sr-only">
                                {met
                                    ? t('qubdi.account.passwordField.met')
                                    : t('qubdi.account.passwordField.notMet')}
                            </span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};
