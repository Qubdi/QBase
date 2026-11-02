import React from 'react';

import { Logo } from '@/components/logo/logo';
import { Link } from 'react-router-dom';

export const TopNavbarMock: React.FC = () => {
    return (
        <nav className="flex h-[105px] flex-col justify-between border-b px-3 md:h-12 md:flex-row md:items-center md:px-4">
            <div className="flex flex-1 flex-col justify-between gap-x-1 md:flex-row md:justify-normal">
                <div className="flex items-center justify-between pt-[8px] font-primary md:py-[10px]">
                    <Link to="/">
                        <Logo />
                    </Link>
                </div>
            </div>
        </nav>
    );
};
