import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Input } from '@/platform/ui/input';
import { Textarea } from '@/platform/ui/textarea';

interface Common {
    /** the text kept in the document */
    value: string;
    /** called with the new text after typing pauses, and when the box loses focus */
    onCommit: (value: string) => void;
    /** wait after the last keystroke, in ms */
    delay?: number;
    /** an empty text is not committed (names) */
    required?: boolean;
    readOnly?: boolean;
}

/**
 * Keeps what is typed in the box and hands it over once typing pauses
 * (EDT-094, EDT-118). Text equal to the saved one, and empty text where one is
 * required, are never handed over. When the saved text changes from outside
 * (undo) the box follows it.
 */
function useDebounced({
    value,
    onCommit,
    delay = 300,
    required,
}: Common): [string, (next: string) => void, () => void] {
    const [text, setText] = useState(value);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const latest = useRef({ value, onCommit, required, text });
    useLayoutEffect(() => {
        latest.current = { value, onCommit, required, text };
    });

    const flush = () => {
        clearTimeout(timer.current);
        timer.current = undefined;
        const {
            value: saved,
            onCommit: commit,
            required: need,
            text: now,
        } = latest.current;
        if (now === saved || (need && now.trim() === '')) return;
        commit(now);
    };

    // leaving the box: commit, and an empty name that was refused shows the saved one again
    const leave = () => {
        flush();
        const { value: saved, required: need, text: now } = latest.current;
        if (need && now.trim() === '') {
            latest.current.text = saved;
            setText(saved);
        }
    };

    // the saved text changed from outside: the box follows it
    const [seen, setSeen] = useState(value);
    if (seen !== value) {
        setSeen(value);
        setText(value);
    }

    // closing the form before the pause ends must not lose the typed text
    useEffect(
        () => () => {
            if (timer.current !== undefined) flush();
        },
        // flush only reads refs
        []
    );

    const change = (next: string) => {
        setText(next);
        latest.current.text = next;
        clearTimeout(timer.current);
        timer.current = setTimeout(flush, delay);
    };
    return [text, change, leave];
}

export const DebouncedInput: React.FC<
    Common &
        Omit<
            React.InputHTMLAttributes<HTMLInputElement>,
            'value' | 'onChange' | 'readOnly'
        > & {
            /** takes focus and selects its text when it first appears (a new field) */
            focusOnMount?: boolean;
        }
> = ({
    value,
    onCommit,
    delay,
    required,
    readOnly,
    onBlur,
    focusOnMount,
    ...rest
}) => {
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (!focusOnMount) return;
        ref.current?.focus();
        ref.current?.select();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- focus and select only when the field first appears
    }, []);
    const [text, change, flush] = useDebounced({
        value,
        onCommit,
        delay,
        required,
    });
    return (
        <Input
            {...rest}
            ref={ref}
            value={text}
            readOnly={readOnly}
            onChange={(e) => change(e.target.value)}
            onBlur={(e) => {
                flush();
                onBlur?.(e);
            }}
        />
    );
};

export const DebouncedTextarea: React.FC<
    Common &
        Omit<
            React.TextareaHTMLAttributes<HTMLTextAreaElement>,
            'value' | 'onChange' | 'readOnly'
        >
> = ({ value, onCommit, delay, required, readOnly, onBlur, ...rest }) => {
    const [text, change, flush] = useDebounced({
        value,
        onCommit,
        delay,
        required,
    });
    return (
        <Textarea
            {...rest}
            value={text}
            readOnly={readOnly}
            onChange={(e) => change(e.target.value)}
            onBlur={(e) => {
                flush();
                onBlur?.(e);
            }}
        />
    );
};
