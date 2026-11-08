import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/platform/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/platform/ui/popover';

/**
 * "Need help? Watch how": the old editor played a short recorded demo here. That
 * recording was made by others and is not shipped; this opens a short written
 * version of the same steps in its place.
 */
export const ImportHelp: React.FC = () => {
    const { t } = useTranslation();
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    className="px-4 text-primary hover:bg-transparent hover:text-primary hover:underline"
                >
                    {t('editor.importing.box.needHelp')}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="text-sm">
                {t('editor.importing.box.helpBody')}
            </PopoverContent>
        </Popover>
    );
};
