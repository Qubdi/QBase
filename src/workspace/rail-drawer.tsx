import React from 'react';
import * as Sheet from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { Rail } from './rail';

export interface RailDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/** The phone's version of the rail: a narrow sheet from the left edge over a dimmed page. */
export const RailDrawer: React.FC<RailDrawerProps> = ({
    open,
    onOpenChange,
}) => {
    const { t } = useTranslation();
    return (
        <Sheet.Root open={open} onOpenChange={onOpenChange}>
            <Sheet.Portal>
                <Sheet.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
                <Sheet.Content className="fixed inset-y-0 left-0 z-50 flex w-[91px] flex-col bg-sidebar shadow-lg outline-none duration-150 data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left">
                    <Sheet.Title asChild>
                        <span className="px-2 pt-2 text-base font-semibold">
                            <span className="sr-only">
                                {t('editor.workspace.navbar.sidebarTitle')}
                            </span>
                            <span aria-hidden>
                                <span className="text-primary">Q</span>Base
                            </span>
                        </span>
                    </Sheet.Title>
                    <Sheet.Description className="sr-only">
                        {t('editor.workspace.navbar.sidebarDescription')}
                    </Sheet.Description>
                    <Rail row onAction={() => onOpenChange(false)} />
                </Sheet.Content>
            </Sheet.Portal>
        </Sheet.Root>
    );
};
