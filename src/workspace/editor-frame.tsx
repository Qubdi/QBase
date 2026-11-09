import React, { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { Pencil } from 'lucide-react';
import { Button } from '@/platform/ui/button';
import { AccessBanner } from '@/components/qubdi/access-banner';
import { ServerAutosave } from '@/components/qubdi/server-autosave';
import { selectLocked } from '@/store/selectors';
import { useEditorStore, useEditorStoreApi } from '@/store/store-context';
import { CanvasSlot } from './canvas-slot';
import { MobilePanel } from './mobile-panel';
import { MobileNavbar, Slot, TopNavbar } from './navbar/top-navbar';
import {
    clampPanelWidth,
    defaultPanelWidth,
    minPanelWidth,
    RAIL_WIDTH,
} from './panel-width';
import { Rail } from './rail';
import { RailDrawer } from './rail-drawer';
import { RememberDefault } from './remember-default';
import { SidePanelSlot } from './side-panel-slot';
import { useIsDesktop } from './use-is-desktop';
import { useWorkspaceCommands } from './use-workspace-commands';
import { useWorkspaceShortcuts } from './use-workspace-shortcuts';

/** The drag handle between the side panel and the canvas. */
const PanelHandle: React.FC<{
    width: number;
    container: () => number;
    onResize: (width: number, dragging: boolean) => void;
}> = ({ width, container, onResize }) => {
    const { t } = useTranslation();
    const start = useRef<{ x: number; width: number } | undefined>(undefined);
    return (
        <div
            role="slider"
            aria-orientation="vertical"
            aria-label={t('editor.workspace.frame.resizePanel')}
            aria-valuenow={width}
            aria-valuetext={`${width}px`}
            aria-valuemin={minPanelWidth(container())}
            aria-valuemax={Math.round(container() * 0.99)}
            tabIndex={0}
            className="relative w-px shrink-0 touch-none bg-border before:absolute before:inset-y-0 before:-inset-x-1 before:cursor-col-resize before:content-[''] focus-visible:bg-primary"
            onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                start.current = { x: e.clientX, width };
            }}
            onPointerMove={(e) => {
                if (!start.current) return;
                onResize(
                    clampPanelWidth(
                        start.current.width + e.clientX - start.current.x,
                        container()
                    ),
                    true
                );
            }}
            onPointerUp={() => {
                start.current = undefined;
                onResize(width, false);
            }}
            onKeyDown={(e) => {
                const step =
                    e.key === 'ArrowRight'
                        ? 20
                        : e.key === 'ArrowLeft'
                          ? -20
                          : 0;
                if (!step) return;
                e.preventDefault();
                onResize(clampPanelWidth(width + step, container()), false);
            }}
        />
    );
};

/** The part of the frame that differs between desktop and phone. */
const Body: React.FC<{ desktop: boolean }> = ({ desktop }) => {
    const { t } = useTranslation();
    const store = useEditorStoreApi();
    const panelOpen = useEditorStore((s) => s.ui.panel.open);
    const locked = useEditorStore(selectLocked);
    const designName = useEditorStore((s) => s.design.name);
    const row = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(() =>
        defaultPanelWidth(
            typeof window === 'undefined'
                ? 1400
                : window.innerWidth - RAIL_WIDTH
        )
    );
    const [dragging, setDragging] = useState(false);
    const [railOpen, setRailOpen] = useState(false);
    const commands = useWorkspaceCommands();
    useWorkspaceShortcuts(commands);

    // the panel starts hidden on a phone and shown on a desktop (spec A7)
    useEffect(() => {
        if (!desktop) store.getState().hidePanel();
    }, [desktop, store]);

    const container = () =>
        (row.current?.clientWidth ?? window.innerWidth) - RAIL_WIDTH;

    return (
        <div
            className={
                desktop
                    ? 'flex h-screen w-screen flex-col'
                    : 'flex h-dvh w-dvw flex-col'
            }
        >
            <h1 className="sr-only">{designName || 'QBase'}</h1>
            {desktop ? (
                <TopNavbar commands={commands} />
            ) : (
                <MobileNavbar
                    commands={commands}
                    railOpen={railOpen}
                    onToggleRail={() => setRailOpen((o) => !o)}
                />
            )}
            <Slot name="below-navbar" className="shrink-0 empty:hidden">
                <AccessBanner />
            </Slot>
            <div ref={row} className="relative flex min-h-0 flex-1">
                {desktop ? (
                    <>
                        <Rail />
                        <div
                            aria-hidden={!panelOpen}
                            inert={!panelOpen}
                            className={`shrink-0 overflow-hidden bg-background ${dragging ? '' : 'transition-[width] duration-200'}`}
                            style={{ width: panelOpen ? width : 0 }}
                        >
                            <div style={{ width }} className="h-full">
                                <SidePanelSlot />
                            </div>
                        </div>
                        {panelOpen ? (
                            <PanelHandle
                                width={width}
                                container={container}
                                onResize={(next, drag) => {
                                    setWidth(next);
                                    setDragging(drag);
                                }}
                            />
                        ) : null}
                    </>
                ) : null}
                <div data-region="content" className="relative min-w-0 flex-1">
                    <CanvasSlot />
                    {!desktop && !locked ? (
                        <Button
                            size="icon"
                            className="absolute bottom-4 left-4 z-20 size-12 rounded-full shadow-lg"
                            aria-label={t('editor.workspace.frame.openPanel')}
                            onClick={() => store.getState().showPanel()}
                        >
                            <Pencil />
                        </Button>
                    ) : null}
                </div>
            </div>
            {desktop ? null : (
                <>
                    <RailDrawer open={railOpen} onOpenChange={setRailOpen} />
                    <MobilePanel />
                </>
            )}
        </div>
    );
};

const PageTitle: React.FC = () => {
    const { t } = useTranslation();
    const name = useEditorStore((s) => s.design.name);
    return (
        <Helmet>
            <title>
                {name ? `QBase - ${name}` : t('editor.common.app.title')}
            </title>
        </Helmet>
    );
};

/**
 * The editor page below the gates (spec 1): the navbar with its QBase slots,
 * the icon rail, the resizable side panel and the canvas place on a desktop;
 * the compact bar, the overlay rail and the drawer on a phone.
 */
export const EditorFrame: React.FC = () => {
    const desktop = useIsDesktop();
    return (
        <div className="bg-background text-foreground">
            <PageTitle />
            <RememberDefault />
            <Body desktop={desktop} />
            <ServerAutosave />
        </div>
    );
};
