import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { completeLogin, type OidcTokens } from '@/lib/oidc';
import { useAuthStore } from '@/store/authStore';

type Phase = 'working' | 'link_required' | 'error';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const adoptOidcSession = useAuthStore((s) => s.adoptOidcSession);
  const [phase, setPhase] = useState<Phase>('working');
  const [message, setMessage] = useState('');
  const [linking, setLinking] = useState(false);
  const pending = useRef<{ tokens: OidcTokens; returnTo: string } | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        const { tokens, returnTo } = await completeLogin(window.location.search);
        pending.current = { tokens, returnTo };

        const result = await adoptOidcSession(tokens);
        if (result === 'ok') {
          navigate(returnTo, { replace: true });
        } else if (result === 'link_required') {
          setPhase('link_required');
        } else {
          setPhase('error');
          setMessage(useAuthStore.getState().error || 'Sign-in failed. Please try again.');
        }
      } catch (e: any) {
        setPhase('error');
        setMessage(e?.message || 'Sign-in failed. Please try again.');
      }
    })();
  }, [adoptOidcSession, navigate]);

  const confirmLink = async () => {
    if (!pending.current) return;
    setLinking(true);
    const result = await adoptOidcSession(pending.current.tokens, true);
    if (result === 'ok') {
      navigate(pending.current.returnTo, { replace: true });
    } else {
      setPhase('error');
      setMessage(useAuthStore.getState().error || 'Could not link this account.');
    }
  };

  return (
    <div className="h-[calc(100vh-64px)] flex items-center justify-center px-4">
      <div className="text-center space-y-4 max-w-md">
        {phase === 'working' && (
          <>
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Completing sign-in...</p>
          </>
        )}

        {phase === 'link_required' && (
          <>
            <h1 className="text-xl font-semibold">Link your account?</h1>
            <p className="text-sm text-muted-foreground">
              A Scripting Smith account already uses this email address. Linking lets you
              sign in with Google from now on, keeping all your existing work.
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={confirmLink} disabled={linking}>
                {linking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Link my account
              </Button>
              <Button variant="outline" onClick={() => navigate('/login', { replace: true })} disabled={linking}>
                Cancel
              </Button>
            </div>
          </>
        )}

        {phase === 'error' && (
          <>
            <h1 className="text-xl font-semibold text-destructive">Sign-in failed</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Button onClick={() => navigate('/login', { replace: true })}>Back to sign in</Button>
          </>
        )}
      </div>
    </div>
  );
}
