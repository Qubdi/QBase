import React from 'react';
import { Helmet } from 'react-helmet-async';

const DESCRIPTION =
    'Database schema diagrams: import a live database, publish versions, share read-only links, re-sync and detect drift.';

export const HelmetData: React.FC = () => (
    <Helmet>
        <meta name="description" content={DESCRIPTION} />
        <meta property="og:type" content="website" />
        <meta
            property="og:title"
            content="QubdiDB - Database schema diagrams"
        />
        <meta property="og:description" content={DESCRIPTION} />
        <title>QubdiDB - Database schema diagrams</title>
    </Helmet>
);
