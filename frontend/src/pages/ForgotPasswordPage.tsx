import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Mail } from 'lucide-react';
import TypingCodeAnimation from '@/components/TypingCodeAnimation';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      return;
    }

    setIsLoading(true);
    
    // TODO: Implement actual forgot password API call
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
    
    setIsLoading(false);
    setIsSubmitted(true);
  };

  if (isSubmitted) {
    return (
      <div className="relative h-[calc(100vh-64px)] flex-col items-center justify-center grid px-4 sm:px-6">{/* Adjusted height to account for navbar */}

        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[400px]">
          <div className="flex flex-col space-y-2 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <Mail className="h-6 w-6 text-green-600" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Check your email
            </h1>
            <p className="text-sm text-muted-foreground">
              We've sent a password reset link to {email}
            </p>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <p className="text-sm text-muted-foreground">
                  If you don't see the email in your inbox within a few minutes, check your spam folder.
                </p>
                <Button
                  onClick={() => setIsSubmitted(false)}
                  variant="outline"
                  className="w-full"
                >
                  Try a different email
                </Button>
              </div>
            </CardContent>
            <CardFooter>
              <div className="text-center text-sm text-muted-foreground w-full">
                Remember your password?{' '}
                <Link
                  to="/login"
                  className="underline-offset-4 hover:underline text-primary"
                >
                  Sign in
                </Link>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100vh-64px)] flex-col items-center justify-center grid lg:grid-cols-[1fr_1.2fr] px-4 sm:px-6">{/* Adjusted height and proportions */}

      {/* Left side - Typing Animation (hidden on mobile) */}
      <div className="relative hidden lg:flex flex-col dark:border-r overflow-hidden">
        <div className="h-full max-h-[calc(100vh-64px)]">
          <TypingCodeAnimation />
        </div>
      </div>

      {/* Right side - Reset Form */}
      <div className="lg:p-8">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <div className="flex flex-col space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              Forgot password?
            </h1>
            <p className="text-sm text-muted-foreground">
              No worries, we'll send you reset instructions
            </p>
          </div>

          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={isLoading || !email}
                >
                  {isLoading ? 'Sending...' : 'Send reset link'}
                </Button>
              </form>
            </CardContent>

            <CardFooter>
              <div className="w-full text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center text-sm text-muted-foreground hover:text-primary"
                >
                  Back to sign in
                </Link>
              </div>
            </CardFooter>
          </Card>

          <p className="text-center text-sm text-muted-foreground">
            Need help?{' '}
            <a href="#" className="underline underline-offset-4 hover:text-primary">
              Contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
