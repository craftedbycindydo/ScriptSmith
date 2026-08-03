import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { useAuthStore } from '@/store/authStore';
import { Loader2 } from 'lucide-react';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();

  const { resetPassword, isLoading, error, clearError } = useAuthStore();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !password || mismatch) return;

    const ok = await resetPassword(token, password);
    if (ok) setDone(true);
  };

  if (!token) {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-md">
          <h1 className="text-xl font-semibold text-destructive">Invalid reset link</h1>
          <p className="text-sm text-muted-foreground">
            This link is missing its token. Request a new one.
          </p>
          <Button onClick={() => navigate('/forgot-password')}>Request a new link</Button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-md">
          <h1 className="text-xl font-semibold">Password updated</h1>
          <p className="text-sm text-muted-foreground">
            You have been signed out everywhere. Sign in with your new password.
          </p>
          <Button onClick={() => navigate('/login')}>Go to sign in</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] flex items-center justify-center px-4">
      <div className="w-full sm:w-[380px] space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) clearError(); }}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  disabled={isLoading}
                />
                {mismatch && (
                  <p className="text-sm text-destructive">Passwords do not match.</p>
                )}
              </div>

              {error && (
                <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isLoading || !password || mismatch}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Update password
              </Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center">
            <Link to="/login" className="text-sm text-muted-foreground hover:text-primary">
              Back to sign in
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
