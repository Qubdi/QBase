import React, { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { HOST_URL } from '@/lib/env';

export interface TemplatesPageHelmetProps {
    tag?: string;
    isFeatured: boolean;
}

const APP_HOST_URL = 'https://qubdi.example';
export const TemplatesPageHelmet: React.FC<TemplatesPageHelmetProps> = ({
    tag,
    isFeatured,
}) => {
    const { tag: tagParam } = useParams<{ tag: string }>();

    const formattedUrlTag = useMemo(
        () => tag?.toLowerCase().replace(/ /g, '-'),
        [tag]
    );

    const canonicalUrl = useMemo(() => {
        let suffix = '/templates';
        if (formattedUrlTag) {
            suffix += `/tags/${formattedUrlTag}`;
        } else if (isFeatured) {
            suffix += '/featured';
        }

        return `${APP_HOST_URL}${suffix}`;
    }, [isFeatured, formattedUrlTag]);

    const needCanonical =
        HOST_URL !== APP_HOST_URL || (tag && formattedUrlTag !== tagParam);

    return (
        <Helmet>
            {needCanonical ? (
                <link rel="canonical" href={canonicalUrl} />
            ) : null}

            {tag ? (
                <title>{`${tag} database schema diagram templates | QubdiDB`}</title>
            ) : isFeatured ? (
                <title>
                    Featured database schema diagram templates | QubdiDB
                </title>
            ) : (
                <title>Database schema diagram templates | QubdiDB</title>
            )}

            {tag ? (
                <meta
                    name="description"
                    content={`Discover a collection of real-world database schema diagrams for ${tag}, featuring example applications and popular open-source projects.`}
                />
            ) : (
                <meta
                    name="description"
                    content="Discover a collection of real-world database schema diagrams, featuring example applications and popular open-source projects."
                />
            )}

            {tag ? (
                <meta
                    property="og:title"
                    content={`${tag} database schema diagram templates | QubdiDB`}
                />
            ) : isFeatured ? (
                <meta
                    property="og:title"
                    content="Featured database schema diagram templates | QubdiDB"
                />
            ) : (
                <meta
                    property="og:title"
                    content="Database schema diagram templates | QubdiDB"
                />
            )}

            {tag ? (
                <meta
                    property="og:url"
                    content={`${HOST_URL}/templates/${tagParam}`}
                />
            ) : isFeatured ? (
                <meta
                    property="og:url"
                    content={`${HOST_URL}/templates/featured`}
                />
            ) : (
                <meta property="og:url" content={`${HOST_URL}/templates`} />
            )}

            {tag ? (
                <meta
                    property="og:description"
                    content={`Discover a collection of real-world database schema diagrams for ${tag}, featuring example applications and popular open-source projects.`}
                />
            ) : (
                <meta
                    property="og:description"
                    content="Discover a collection of real-world database schema diagrams, featuring example applications and popular open-source projects."
                />
            )}
            <meta property="og:image" content={`${HOST_URL}/qubdidb.png`} />
            <meta property="og:type" content="website" />
            <meta property="og:site_name" content="QubdiDB" />

            {tag ? (
                <meta
                    name="twitter:title"
                    content={`${tag} database schema diagram templates | QubdiDB`}
                />
            ) : (
                <meta
                    name="twitter:title"
                    content="Database schema diagram templates | QubdiDB"
                />
            )}

            {tag ? (
                <meta
                    name="twitter:description"
                    content={`Discover a collection of real-world database schema diagrams for ${tag}, featuring example applications and popular open-source projects.`}
                />
            ) : (
                <meta
                    name="twitter:description"
                    content="Discover a collection of real-world database schema diagrams, featuring example applications and popular open-source projects."
                />
            )}

            <meta name="twitter:image" content={`${HOST_URL}/qubdidb.png`} />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:site" content="@QubdiDB" />
            <meta name="twitter:creator" content="@QubdiDB" />
        </Helmet>
    );
};
