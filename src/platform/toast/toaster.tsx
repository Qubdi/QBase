import React from 'react';
import {
    Toast,
    ToastClose,
    ToastDescription,
    ToastProvider,
    ToastTitle,
    ToastViewport,
} from './toast';
import { useToast } from './use-toast';

export function Toaster() {
    const { toasts, dismiss } = useToast();

    return (
        <ToastProvider>
            {toasts.map(
                ({
                    id,
                    title,
                    description,
                    action,
                    open,
                    variant,
                    layout,
                    hideCloseButton,
                }) => (
                    <Toast
                        key={id}
                        open={open}
                        variant={variant}
                        layout={layout}
                        onOpenChange={(next) => {
                            if (!next) dismiss(id);
                        }}
                    >
                        <div className="grid gap-1">
                            {title ? <ToastTitle>{title}</ToastTitle> : null}
                            {description ? (
                                <ToastDescription>
                                    {description}
                                </ToastDescription>
                            ) : null}
                        </div>
                        {action}
                        {hideCloseButton ? null : <ToastClose />}
                    </Toast>
                )
            )}
            <ToastViewport />
        </ToastProvider>
    );
}
