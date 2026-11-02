import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQubdi } from '@/hooks/use-qubdi';
import { consumeAdminLanding } from '@/lib/qubdi/admin-landing';

/** Mount on the app's home route: admins start on the admin panel. */
export const AdminLandingRedirect: React.FC = () => {
    const { user } = useQubdi();
    const navigate = useNavigate();

    useEffect(() => {
        if (consumeAdminLanding(user)) navigate('/admin', { replace: true });
    }, [user, navigate]);

    return null;
};
