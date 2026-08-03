import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { completeLogin } from '@/lib/oidc';
import { useAuthStore } from '@/store/authStore';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const adoptOidcSession = useAuthStore((s) => s.adoptOidcSession);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        const { tokens, returnTo } = await completeLogin(window.location.search);
        const ok = await adoptOidcSession(tokens);
        if (!ok) {
          setError('Signed in, but this account is not registered in Scripting Smith.');
          return;
        }
        navigate(returnTo, { replace: true });
      } catch (e: any) {
        setError(e?.message || 'Sign-in failed. Please try again.');
      }
    })();
  }, [adoptOidcSession, navigate]);

  return (
    <div className="h-[calc(100vh-64px)] flex items-center justify-center px-4">
      <div className="text-center space-y-4 max-w-md">
        {error ? (
          <>
            <h1 className="text-xl font-semibold text-destructive">Sign-in failed</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={() => navigate('/login', { replace: true })}>Back to sign in</Button>
          </>
        ) : (
          <>
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Completing sign-in...</p>
          </>
        )}
      </div>
    </div>
  );
}
