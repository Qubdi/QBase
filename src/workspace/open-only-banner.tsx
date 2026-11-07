import React from 'react';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import { isOpenOnly } from '@/core/model/database';
import { dialectFor } from '@/dialects/registry';
import { useEditorStore } from '@/store/store-context';
import '@/i18n/editor/register';

/** Says why a diagram of a dropped database (Oracle, ClickHouse) cannot be changed (owner decision 4). */
export const OpenOnlyBanner: React.FC = () => {
    const { t } = useTranslation();
    const type = useEditorStore((s) => s.design.databaseType);
    if (!isOpenOnly(type)) return null;
    return (
        <div
            role="status"
            className="flex items-center gap-2 border-b bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:bg-blue-950 dark:text-blue-100"
        >
            <Lock className="size-4 shrink-0" />
            {t('editor.workspace.banner.openOnly', {
                database: dialectFor(type).label,
            })}
        </div>
    );
};
