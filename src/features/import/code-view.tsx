import React, { useMemo } from 'react';
import { Copy } from 'lucide-react';
import { Button } from '@/platform/ui/button';
import { cn } from '@/lib/utils/utils';
import { highlight } from './code-highlight';
import type { CodeKind, CodeLanguage } from './code-highlight';

const KIND_CLASS: Record<CodeKind, string> = {
    plain: '',
    punct: 'text-[#0000ff] dark:text-[#569cd6]',
    keyword: 'text-[#0000ff] dark:text-[#569cd6]',
    string: 'text-[#e50000] dark:text-[#ce9178]',
    comment: 'italic text-[#008000] dark:text-[#6a9955]',
    number: 'text-[#098658] dark:text-[#b5cea8]',
    func: 'text-[#af00db] dark:text-[#c586c0]',
    ident: 'text-[#001080] dark:text-[#9cdcfe]',
    flag: 'text-[#e50000] dark:text-[#ce9178]',
    type: 'text-[#267f99] dark:text-[#4ec9b0]',
};

export interface CodeViewProps {
    code: string;
    language: CodeLanguage;
    /** the accessible name of the read-only box */
    label: string;
    /** the copy button; left out when there is nothing to copy to */
    copyLabel?: string;
    onCopy?: () => void;
    className?: string;
}

/** A read-only code box: line numbers, colours, a scrolling body and a copy button. */
export const CodeView: React.FC<CodeViewProps> = ({
    code,
    language,
    label,
    copyLabel,
    onCopy,
    className,
}) => {
    const lines = useMemo(() => highlight(code, language), [code, language]);
    return (
        <div
            className={cn(
                'relative rounded-md border bg-background font-mono text-[13px] leading-[19px]',
                className
            )}
        >
            <div
                role="textbox"
                aria-readonly="true"
                aria-multiline="true"
                aria-label={label}
                tabIndex={0}
                className="h-full overflow-auto py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <div className="flex min-w-max">
                    <div
                        aria-hidden
                        className="sticky left-0 select-none bg-background pl-2 pr-3 text-right text-[#237893] dark:text-[#858585]"
                    >
                        {lines.map((_, n) => (
                            <div key={n}>{n + 1}</div>
                        ))}
                    </div>
                    <pre className="m-0 pr-12">
                        {lines.map((spans, n) => (
                            <div key={n} className="whitespace-pre">
                                {spans.length === 0 ? '​' : null}
                                {spans.map((s, k) => (
                                    <span
                                        key={k}
                                        className={KIND_CLASS[s.kind]}
                                    >
                                        {s.text}
                                    </span>
                                ))}
                            </div>
                        ))}
                    </pre>
                </div>
            </div>
            {onCopy && copyLabel ? (
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="absolute right-1 top-1 size-[30px]"
                    aria-label={copyLabel}
                    onClick={onCopy}
                >
                    <Copy />
                </Button>
            ) : null}
        </div>
    );
};
