import React, { useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { exportDbml } from '@/formats/dbml/export-dbml';
import { useEditorEnv } from '@/platform/panel/use-editor';
import { useText } from '@/platform/panel/use-text';
import { Button } from '@/platform/ui/button';
import { toast } from '@/platform/toast/use-toast';

/**
 * The DBML section, read-only for now (EDT-238): the design as DBML text with
 * a switch between standard and inline references and a copy button. Editing
 * with a preview diff (EDT-239 to EDT-247) belongs to the compare feature.
 * This file is loaded on demand: the DBML library is large.
 */
export const DbmlSection: React.FC = () => {
    const { design } = useEditorEnv();
    const text = useText();
    const [inline, setInline] = useState(false);
    const result = useMemo(
        () => exportDbml(design, { inline }),
        [design, inline]
    );

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(result.text);
            toast({ title: text('dbml.copied') });
        } catch {
            toast({ title: text('dbml.failed'), variant: 'destructive' });
        }
    };

    return (
        <div className="flex h-full flex-col gap-2 p-2">
            <div className="flex items-center gap-2">
                <h3 className="flex-1 text-sm font-semibold">
                    {text('dbml.title')}
                </h3>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-pressed={inline}
                    onClick={() => setInline((v) => !v)}
                >
                    {inline
                        ? text('dbml.standardRefs')
                        : text('dbml.inlineRefs')}
                </Button>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label={text('dbml.copy')}
                    onClick={() => void copy()}
                >
                    <Copy />
                </Button>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-xs">
                {result.text || text('dbml.empty')}
            </pre>
        </div>
    );
};
