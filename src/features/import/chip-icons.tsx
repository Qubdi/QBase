import React from 'react';
import { Code, FileCode } from 'lucide-react';
import { databaseIcon } from '@/components/diagram-icon/database-logos';
import qubdiMark from '@/assets/qubdi-mark.svg';
import supabase from '@/assets/databases/edition-supabase.png';
import timescale from '@/assets/databases/edition-timescale.png';
import cloudflareD1 from '@/assets/databases/edition-cloudflare-d1.png';
import mysql57 from '@/assets/databases/edition-mysql-5-7.png';
import type { ImportMethod } from './import-method';

const EDITION_IMAGES: Record<string, string> = {
    supabase,
    timescale,
    cloudflare_d1: cloudflareD1,
    mysql_5_7: mysql57,
};

/** The small picture on an edition choice; the regular edition shows its database. */
export const EditionIcon: React.FC<{
    databaseType: string;
    edition: string;
}> = ({ databaseType, edition }) => {
    const src =
        edition === ''
            ? databaseIcon(databaseType)
            : edition === 'sql_server_2016_and_below'
              ? databaseIcon('sql_server')
              : EDITION_IMAGES[edition];
    return src ? (
        <img
            src={src}
            alt=""
            draggable={false}
            className="size-4 shrink-0 rounded-none object-contain"
        />
    ) : null;
};

/** The small picture on an import method choice. */
export const MethodIcon: React.FC<{ method: ImportMethod }> = ({ method }) => {
    if (method === 'sql') return <FileCode className="size-4" />;
    if (method === 'dbml') return <Code className="size-4" />;
    return (
        <img
            src={qubdiMark}
            alt=""
            draggable={false}
            className="h-3 w-4 shrink-0"
        />
    );
};
