import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';

export const HelmetData: React.FC = () => {
    const { t } = useTranslation();
    const title = t('editor.common.app.title');
    const description = t('editor.common.app.description');
    return (
        <Helmet>
            <meta name="description" content={description} />
            <meta property="og:type" content="website" />
            <meta property="og:title" content={title} />
            <meta property="og:description" content={description} />
            <title>{title}</title>
        </Helmet>
    );
};
