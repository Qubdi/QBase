import React, { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils/utils';

export interface FileUploaderProps {
    /** file types the picker offers, for example `.json` */
    accept: string;
    onFilesChange: (files: File[]) => void;
    /** the line inside the box */
    label: string;
    /** name of the chosen file, shown once there is one */
    chosen?: string;
    disabled?: boolean;
    className?: string;
}

/** A box that takes a dropped file or opens the file picker when clicked. */
export const FileUploader: React.FC<FileUploaderProps> = ({
    accept,
    onFilesChange,
    label,
    chosen,
    disabled,
    className,
}) => {
    const input = useRef<HTMLInputElement>(null);
    const [over, setOver] = useState(false);
    const take = (list: FileList | null) => {
        if (list && list.length > 0) onFilesChange(Array.from(list));
    };
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                if (!disabled) take(e.dataTransfer.files);
            }}
            className={cn(
                'flex h-32 w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed text-sm text-muted-foreground transition-colors hover:bg-accent/40 disabled:opacity-50',
                over && 'border-primary bg-accent/40',
                className
            )}
        >
            <Upload className="size-5" />
            <span>{chosen ?? label}</span>
            <input
                ref={input}
                type="file"
                accept={accept}
                hidden
                onChange={(e) => {
                    take(e.target.files);
                    e.target.value = '';
                }}
            />
        </button>
    );
};
