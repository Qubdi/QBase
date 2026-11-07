import React, { useState } from 'react';
import { Button } from '@/platform/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/platform/ui/dialog';
import { Input } from '@/platform/ui/input';
import { Label } from '@/platform/ui/label';
import { OptionSelect } from '@/components/option-select/option-select';
import { useText } from '@/platform/panel/use-text';

/** Asks which of several shown schemas the new table belongs to (EDT-076). */
export const SelectSchemaDialog: React.FC<{
    schemas: readonly string[];
    defaultSchema: string;
    onConfirm: (schema: string) => void;
    onCancel: () => void;
}> = ({ schemas, defaultSchema, onConfirm, onCancel }) => {
    const text = useText();
    const [schema, setSchema] = useState(defaultSchema);
    return (
        <Dialog open onOpenChange={(open) => !open && onCancel()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {text('tables.selectSchema.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {text('tables.selectSchema.text')}
                    </DialogDescription>
                </DialogHeader>
                <OptionSelect
                    aria-label={text('tables.selectSchema.schema')}
                    value={schema}
                    onValueChange={setSchema}
                    options={schemas.map((s) => ({ value: s, label: s }))}
                />
                <DialogFooter>
                    <Button variant="outline" onClick={onCancel}>
                        {text('common.cancel')}
                    </Button>
                    <Button onClick={() => onConfirm(schema)}>
                        {text('common.confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

/**
 * Change Schema (EDT-101): a picker of the known schemas, or a box for a new
 * one. Only the one table changes.
 */
export const ChangeSchemaDialog: React.FC<{
    tableName: string;
    current: string | undefined;
    schemas: readonly string[];
    onChange: (schema: string) => void;
    onCancel: () => void;
}> = ({ tableName, current, schemas, onChange, onCancel }) => {
    const text = useText();
    const [fresh, setFresh] = useState(schemas.length === 0);
    const [picked, setPicked] = useState(current ?? schemas[0] ?? '');
    const [typed, setTyped] = useState('');
    const value = (fresh ? typed : picked).trim();
    return (
        <Dialog open onOpenChange={(open) => !open && onCancel()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {text('tables.changeSchemaDialog.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {text('tables.changeSchemaDialog.text', {
                            name: tableName,
                        })}
                    </DialogDescription>
                </DialogHeader>
                {fresh ? (
                    <Input
                        aria-label={text(
                            'tables.changeSchemaDialog.newPlaceholder'
                        )}
                        placeholder={text(
                            'tables.changeSchemaDialog.newPlaceholder'
                        )}
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && value) onChange(value);
                        }}
                    />
                ) : (
                    <OptionSelect
                        aria-label={text('tables.selectSchema.schema')}
                        value={picked}
                        onValueChange={setPicked}
                        options={schemas.map((s) => ({ value: s, label: s }))}
                    />
                )}
                {schemas.length > 0 ? (
                    <Label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={fresh}
                            onChange={(e) => setFresh(e.target.checked)}
                        />
                        {text('tables.changeSchemaDialog.createNew')}
                    </Label>
                ) : null}
                <DialogFooter>
                    <Button variant="outline" onClick={onCancel}>
                        {text('common.cancel')}
                    </Button>
                    <Button disabled={!value} onClick={() => onChange(value)}>
                        {text('tables.changeSchemaDialog.change')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
