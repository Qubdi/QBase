import React, { useEffect, useState } from 'react';
import { Button } from '@/components/button/button';
import { Input } from '@/components/input/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/dialog/dialog';
import { errorMessage } from '@/lib/qubdi/api';

export interface NewProjectDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Creates the project. Throws when the server refuses, e.g. the name is taken. */
    onCreate: (name: string, description: string) => Promise<void>;
}

/** Asks for the name (and a description) of a project, and says why if it is refused. */
export const NewProjectDialog: React.FC<NewProjectDialogProps> = ({
    open,
    onOpenChange,
    onCreate,
}) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    // each time it opens it is a blank form
    useEffect(() => {
        if (open) {
            setName('');
            setDescription('');
            setError(null);
        }
    }, [open]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
            await onCreate(name.trim(), description.trim());
            onOpenChange(false);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
            <DialogContent className="max-w-md" showClose>
                <DialogHeader>
                    <DialogTitle>New project</DialogTitle>
                    <DialogDescription>
                        A project holds diagrams and decides who can see them.
                        You choose the people right after.
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="flex flex-col gap-3"
                    aria-label="Create project"
                    onSubmit={(e) => void submit(e)}
                >
                    <Input
                        aria-label="Project name"
                        placeholder="Project name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={100}
                        required
                        autoFocus
                    />
                    <Input
                        aria-label="Description (optional)"
                        placeholder="Description (optional)"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        maxLength={500}
                    />
                    {error ? (
                        <p role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    ) : null}
                    <div className="flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => onOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={busy || !name.trim()}>
                            Create project
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
