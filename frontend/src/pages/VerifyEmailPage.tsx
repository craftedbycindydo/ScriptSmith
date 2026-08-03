import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { apiService } from '@/services/api';

type State = 'pending' | 'ok' | 'failed';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const [state, setState] = useState<State>('pending');
  const [message, setMessage] = useState('');
  const ran = useRef(false);

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
      .then(() => setState('ok'))
      .catch((e: any) => {
        setState('failed');
        setMessage(e?.response?.data?.detail || 'This verification link is invalid or has expired.');
      });
  }, [token]);

  return (
    <div className="h-[calc(100vh-64px)] flex items-center justify-center px-4">
      <div className="text-center space-y-4 max-w-md">
        {state === 'pending' && (
          <>
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Verifying your email...</p>
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
            <Button variant="outline" onClick={() => navigate('/login')}>Back to sign in</Button>
          </>
        )}
      </div>
    </div>
  );
}
