import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { AuthMeDTO } from '../shared';
import { api, SESSION_EXPIRED_EVENT } from '../lib/api';
import { authStore } from '../lib/auth';
import { AuthProvider } from '../lib/authContext';
import { PageSpinner } from './ui/Spinner';

type Session = { status: 'checking' } | { status: 'anonymous' } | { status: 'authed'; me: AuthMeDTO };

/** Signs the user in (or sends them to /login) and provides their server-resolved permissions to everything below. */
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>({ status: 'checking' });

  useEffect(() => {
    if (!authStore.getToken()) {
      setSession({ status: 'anonymous' });
      return;
    }
    api
      .me()
      .then((me) => setSession({ status: 'authed', me }))
      .catch(() => {
        authStore.clearToken();
        setSession({ status: 'anonymous' });
      });
  }, []);

  // Any API call that comes back "session expired" sends the user straight to sign-in instead of leaving a broken page.
  useEffect(() => {
    const onExpired = () => setSession({ status: 'anonymous' });
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  if (session.status === 'checking') return <div className="page-center"><PageSpinner label="Checking your session…" /></div>;
  if (session.status === 'anonymous') return <Navigate to="/login" replace />;
  return <AuthProvider me={session.me}>{children}</AuthProvider>;
}
