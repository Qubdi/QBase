import React, { useState } from 'react';
import { FileMinusCorner, FileOutput, FileTypeCorner } from 'lucide-react';
import { OptionSelect } from '@/components/option-select/option-select';
import { Button } from '@/platform/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/platform/ui/dialog';
import { useEditorEnv } from '@/platform/panel/use-editor';
import { useText } from '@/platform/panel/use-text';
import type { Text } from '@/platform/panel/use-text';
import type { Id } from '@/core/model/id';
import { linkableTables } from './link-rules';
import { useCreateLink } from './use-create-link';

const Picker: React.FC<{
    icon: React.ReactNode;
    label: string;
    placeholder: string;
    empty: string;
    value: string;
    disabled?: boolean;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
}> = ({
    icon,
    label,
    placeholder,
    empty,
    value,
    disabled,
    options,
    onChange,
}) => (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-1 text-xs font-bold text-slate-600 dark:text-slate-300">
            {icon}
            <span>{label}</span>
        </div>
        {options.length === 0 && !disabled ? (
            <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                {empty}
            </p>
        ) : (
            <OptionSelect
                aria-label={label}
                className="h-8 py-1"
                value={value}
                disabled={disabled}
                placeholder={placeholder}
                onValueChange={onChange}
                options={options}
            />
        )}
    </div>
);

/**
 * Create Relationship (EDT-163 to EDT-166): Primary Table and Field, then
 * Referenced Table and Field. Create stays disabled until all four are chosen.
 */
export const CreateLinkDialog: React.FC<{
    onClose: () => void;
    onCreated?: (linkId: Id) => void;
}> = ({ onClose, onCreated }) => {
    const { design } = useEditorEnv();
    const text: Text = useText();
    const create = useCreateLink();
    const [fromTable, setFromTable] = useState('');
    const [fromField, setFromField] = useState('');
    const [toTable, setToTable] = useState('');
    const [toField, setToField] = useState('');

    const tables = linkableTables(design).map((e) => ({
        value: e.id,
        label: e.name,
    }));
    const fieldsOf = (tableId: string) => {
        const entity = design.entities.byId[tableId];
        return entity
            ? entity.columnIds
                  .map((id) => design.columns[id])
                  .filter(Boolean)
                  .map((c) => ({ value: c.id, label: c.name }))
            : [];
    };
    const ready = fromTable && fromField && toTable && toField;

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{text('refs.dialog.title')}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                    <div className="flex flex-row justify-between gap-2">
                        <Picker
                            icon={<FileOutput className="size-4" />}
                            label={text('refs.primaryTable')}
                            placeholder={text('refs.dialog.selectTable')}
                            empty={text('refs.dialog.noTables')}
                            value={fromTable}
                            options={tables}
                            onChange={(v) => {
                                setFromTable(v);
                                setFromField('');
                            }}
                        />

                        <Picker
                            icon={<FileTypeCorner className="size-4" />}
                            label={text('refs.primaryField')}
                            placeholder={text('refs.dialog.selectField')}
                            empty={text('refs.dialog.noFields')}
                            value={fromField}
                            disabled={!fromTable}
                            options={fieldsOf(fromTable)}
                            onChange={setFromField}
                        />
                    </div>
                    <div className="flex flex-row justify-between gap-2">
                        <Picker
                            icon={<FileMinusCorner className="size-4" />}
                            label={text('refs.referencedTable')}
                            placeholder={text('refs.dialog.selectTable')}
                            empty={text('refs.dialog.noTables')}
                            value={toTable}
                            options={tables}
                            onChange={(v) => {
                                setToTable(v);
                                setToField('');
                            }}
                        />

                        <Picker
                            icon={<FileTypeCorner className="size-4" />}
                            label={text('refs.referencedField')}
                            placeholder={text('refs.dialog.selectField')}
                            empty={text('refs.dialog.noFields')}
                            value={toField}
                            disabled={!toTable}
                            options={fieldsOf(toTable)}
                            onChange={setToField}
                        />
                    </div>
                </div>
                <DialogFooter className="sm:justify-between">
                    <Button variant="secondary" onClick={onClose}>
                        {text('common.cancel')}
                    </Button>
                    <Button
                        disabled={!ready}
                        onClick={() => {
                            const id = create(
                                { entityId: fromTable, columnId: fromField },
                                { entityId: toTable, columnId: toField }
                            );
                            if (id) {
                                onCreated?.(id);
                                onClose();
                            }
                        }}
                    >
                        {text('refs.dialog.create')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
