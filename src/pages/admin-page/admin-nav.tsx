import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';
import {
    Activity,
    FolderKanban,
    LayoutDashboard,
    Network,
    Users,
    type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    ADMIN_SECTIONS,
    adminPath,
    type AdminSectionId,
} from './admin-sections';

const ICONS: Record<AdminSectionId, LucideIcon> = {
    overview: LayoutDashboard,
    projects: FolderKanban,
    users: Users,
    diagrams: Network,
    activity: Activity,
};

/**
 * The admin sections. A column on the left from the md breakpoint up; on small
 * screens it is a row above the page that scrolls sideways if it must, and it
 * brings the current section into view so it is never the hidden one.
 */
export const AdminNav: React.FC = () => {
    const { t } = useTranslation();
    const list = useRef<HTMLUListElement>(null);
    const { pathname } = useLocation();

    useEffect(() => {
        list.current
            ?.querySelector('[aria-current="page"]')
            // not every environment can scroll (the tests' DOM, for one)
            ?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
    }, [pathname]);

    return (
        <nav
            aria-label={t('qubdi.adminUsers.nav.ariaLabel')}
            className="border-b pb-3 md:w-52 md:shrink-0 md:border-b-0 md:pb-0"
        >
            <ul
                ref={list}
                className="-mx-1 flex gap-1 overflow-x-auto px-1 md:sticky md:top-8 md:mx-0 md:flex-col md:overflow-visible md:px-0"
            >
                {ADMIN_SECTIONS.map((section) => {
                    const Icon = ICONS[section.id];
                    return (
                        <li key={section.id} className="shrink-0">
                            <NavLink
                                to={adminPath(section.id)}
                                className={({ isActive }) =>
                                    cn(
                                        'flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors',
                                        'hover:bg-accent hover:text-accent-foreground',
                                        'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
                                        isActive
                                            ? 'bg-accent text-accent-foreground'
                                            : 'text-muted-foreground'
                                    )
                                }
                            >
                                <Icon className="size-4 shrink-0" aria-hidden />
                                {section.label}
                            </NavLink>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
};
