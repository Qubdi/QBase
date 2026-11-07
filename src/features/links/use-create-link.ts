import { useCallback } from 'react';
import type { Id } from '@/core/model/id';
import { planLink } from '@/core/commands/plan-link';
import { toast } from '@/platform/toast/use-toast';
import { useEditorEnv } from '@/platform/panel/use-editor';
import { useText } from '@/platform/panel/use-text';
import { refusalOf } from './link-rules';

export interface LinkEnd {
    entityId: Id;
    columnId: Id;
}

/**
 * Creates a link between two columns, or says why not (EDT-154, EDT-155,
 * EDT-166): incompatible types and an existing pair show a red notice and
 * change nothing. Returns the id of the new link, or of the existing one.
 */
export function useCreateLink() {
    const { design, edit } = useEditorEnv();
    const text = useText();
    return useCallback(
        (source: LinkEnd, target: LinkEnd): Id | undefined => {
            const plan = planLink(design, source, target);
            const refusal = refusalOf(plan);
            if (refusal === 'incompatible') {
                toast({
                    title: text('refs.toast.incompatibleTitle'),
                    description: text('refs.toast.incompatibleText'),
                    variant: 'destructive',
                });
                return undefined;
            }
            if (refusal === 'exists') {
                toast({
                    title: text('refs.toast.existsTitle'),
                    description: text('refs.toast.existsText'),
                    variant: 'destructive',
                });
                return undefined;
            }
            if (plan.kind !== 'ok') {
                toast({
                    title: text('refs.toast.failedTitle'),
                    description: text('refs.toast.failedText'),
                    variant: 'destructive',
                });
                return undefined;
            }
            const result = edit(plan.command);
            return result?.ok ? plan.link.id : undefined;
        },
        [design, edit, text]
    );
}
