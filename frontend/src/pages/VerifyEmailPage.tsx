import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { apiService } from '@/services/api';
import { useAuthStore } from '@/store/authStore';

type State = 'pending' | 'ok' | 'failed';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const adoptVerifiedSession = useAuthStore((s) => s.adoptVerifiedSession);
  const [state, setState] = useState<State>('pending');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendError, setResendError] = useState('');
  const ran = useRef(false);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setResending(true);
    setResendError('');
    try {
      await apiService.resendVerification(email);
      setResent(true);
    } catch (err: any) {
      setResendError(err?.response?.data?.detail || 'Could not send right now. Please try again.');
    } finally {
      setResending(false);
    }
  };

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (!token) {
      setState('failed');
      setMessage('This link is missing its verification token.');
      return;
    }

    apiService
      .verifyEmail(token)
      .then(async (tokens) => {
        // Verification succeeded either way; only the sign-in can still fail,
        // in which case fall back to sending them to the login form.
        const signedIn = await adoptVerifiedSession(tokens);
        if (signedIn) {
          navigate('/', { replace: true });
          return;
        }
        setState('ok');
      })
      .catch((e: any) => {
        setState('failed');
        setMessage(e?.response?.data?.detail || 'This verification link is invalid or has expired.');
      });
  }, [token, adoptVerifiedSession, navigate]);

  return (
    <div className="h-[calc(100vh-64px)] flex items-center justify-center px-4">
      <div className="text-center space-y-4 max-w-md">
        {state === 'pending' && (
          <>
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Verifying your email and signing you in...</p>
          </>
        )}

        {state === 'ok' && (
          <>
            <h1 className="text-xl font-semibold">Email verified</h1>
            <p className="text-sm text-muted-foreground">Your email address is confirmed.</p>
            <Button onClick={() => navigate('/login')}>Go to sign in</Button>
          </>
        )}

        {state === 'failed' && (
          <>
            <h1 className="text-xl font-semibold text-destructive">Verification failed</h1>
            <p className="text-sm text-muted-foreground">{message}</p>

            {resent ? (
              <p className="text-sm text-muted-foreground">
                If that address still needs verifying, a new link is on its way.
              </p>
            ) : (
              <form onSubmit={handleResend} className="space-y-2">
                <Input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={resending}
                />
                <Button type="submit" className="w-full" disabled={resending || !email}>
                  {resending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Send a new link
                </Button>
                {resendError && <p className="text-sm text-destructive">{resendError}</p>}
              </form>
            )}

            <Button variant="outline" onClick={() => navigate('/login')}>Back to sign in</Button>
          </>
        )}
      </div>
    </div>
  );
}
