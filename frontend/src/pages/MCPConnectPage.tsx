import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { config } from '../config/env';
import { Loader2, Plug, XCircle } from 'lucide-react';

/**
 * Consent screen for the MCP connector (Claude, ChatGPT).
 *
 * The backend sends the person here after Zitadel has signed them in, with an
 * opaque ?request=<id>. That id is the whole capability - identity was already
 * established on the Zitadel leg - so this page does not need an app session,
 * which is why it works even in the fresh browser profile an AI client opens.
 *
 * On Approve the backend turns the request into an authorization code and
 * hands back the URL to bounce to, which always goes to the client's
 * pre-registered redirect_uri.
 */

// The API base is '/api'-suffixed in dev and bare in production; these OAuth
// routes sit at the root either way.
const API_ORIGIN = config.apiBaseUrl.replace(/\/api\/?$/, '');

interface ConnectRequest {
  client_name: string;
  account_name: string | null;
  account_email: string | null;
}

type Status = 'loading' | 'ready' | 'approving' | 'expired' | 'error';

export default function MCPConnectPage() {
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get('request');

  const [status, setStatus] = useState<Status>('loading');
  const [details, setDetails] = useState<ConnectRequest | null>(null);

  // Clickjacking guard: an approval button must never render inside a frame.
  const framed = typeof window !== 'undefined' && window.top !== window.self;

  useEffect(() => {
    if (!requestId || framed) {
      setStatus('error');
      return;
    }
    axios
      .get<ConnectRequest>(`${API_ORIGIN}/mcp/oauth/request/${encodeURIComponent(requestId)}`)
      .then((res) => {
        setDetails(res.data);
        setStatus('ready');
      })
      .catch((err) => setStatus(err?.response?.status === 404 ? 'expired' : 'error'));
  }, [requestId, framed]);

  if (framed) return null;

  const approve = async () => {
    setStatus('approving');
    try {
      const res = await axios.post<{ redirect_url: string }>(`${API_ORIGIN}/mcp/oauth/approve`, {
        request_id: requestId,
      });
      window.location.href = res.data.redirect_url;
    } catch (err: any) {
      setStatus(err?.response?.status === 404 ? 'expired' : 'error');
    }
  };

  const clientName = details?.client_name || 'An AI assistant';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        {status === 'loading' && (
          <CardContent className="py-16 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        )}

        {(status === 'expired' || status === 'error') && (
          <>
            <CardHeader className="text-center">
              <XCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
              <CardTitle>
                {status === 'expired' ? 'This request has expired' : 'Something went wrong'}
              </CardTitle>
              <CardDescription>
                {status === 'expired'
                  ? 'Connection requests are only valid for a few minutes. Go back to your AI assistant and start the connection again.'
                  : "We couldn't load this connection request. Try connecting again from your AI assistant."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" onClick={() => (window.location.href = '/')}>
                Back to Scripting Smith
              </Button>
            </CardContent>
          </>
        )}

        {(status === 'ready' || status === 'approving') && (
          <>
            <CardHeader className="text-center">
              <Plug className="h-12 w-12 text-primary mx-auto mb-2" />
              <CardTitle>Connect {clientName}?</CardTitle>
              <CardDescription>
                {clientName} is asking to read your Scripting Smith work so it can tutor you.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="rounded-lg border bg-muted/40 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Signed in as
                </p>
                <p className="font-medium leading-tight">{details?.account_name || 'Your account'}</p>
                {details?.account_email && (
                  <p className="text-sm text-muted-foreground break-all">{details.account_email}</p>
                )}
              </div>

              <div className="text-sm text-muted-foreground space-y-2">
                <p className="text-foreground font-medium">It will be able to read:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>your labs, your code and your run history</li>
                  <li>which tests pass and the errors you hit most</li>
                </ul>
                <p className="pt-1">
                  It cannot see anyone else's work, and it cannot change or submit anything for you.
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={status === 'approving'}
                  onClick={() => (window.location.href = '/')}
                >
                  Cancel
                </Button>
                <Button className="flex-1" disabled={status === 'approving'} onClick={approve}>
                  {status === 'approving' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Allow access'
                  )}
                </Button>
              </div>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
