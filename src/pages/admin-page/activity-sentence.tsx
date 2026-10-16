import React from 'react';
import { describeActivity, type Segment } from '@/lib/qubdi/activity';
import type { ActivityItem } from '@/lib/qubdi/api';

export interface Named {
    id: string;
    label: string;
}

export interface ActivitySentenceProps {
    item: ActivityItem;
    /**
     * Without these the sentence is plain text. With them, the person and the
     * diagram in it can be chosen to narrow a list to them (the Activity page).
     */
    onPerson?: (person: Named) => void;
    onDiagram?: (diagram: Named) => void;
    /** already narrowed to this person or diagram: nothing more to choose */
    activeUserId?: string;
    activeDiagramId?: string;
}

/** One line of the audit log as a sentence: "anna@corp.io published Orders v3". */
export const ActivitySentence: React.FC<ActivitySentenceProps> = ({
    item,
    onPerson,
    onDiagram,
    activeUserId,
    activeDiagramId,
}) => {
    const piece = (s: Segment, i: number) => {
        if (s.kind === 'gone') {
            return (
                <span key={i} className="italic text-muted-foreground">
                    {s.text}
                </span>
            );
        }
        if (s.kind === 'text') return <span key={i}>{s.text}</span>;

        const { userId, diagramId } = s;
        const choose =
            onPerson && userId && userId !== activeUserId
                ? () => onPerson({ id: userId, label: s.text })
                : onDiagram && diagramId && diagramId !== activeDiagramId
                  ? () => onDiagram({ id: diagramId, label: s.text })
                  : null;
        if (!choose) {
            return (
                <span key={i} className="break-words font-medium">
                    {s.text}
                </span>
            );
        }
        return (
            <button
                key={i}
                type="button"
                title={
                    s.userId
                        ? `Show only what ${s.text} did`
                        : `Show only the activity on ${s.text}`
                }
                className="break-words rounded-sm text-left font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={choose}
            >
                {s.text}
            </button>
        );
    };
    return <span>{describeActivity(item).map(piece)}</span>;
};
