import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bot, Check, Copy } from 'lucide-react';
import { config } from '@/config/env';
import { useAuthStore } from '@/store/authStore';

/** Settings card: the connector URL and the steps for each assistant. */

const CONNECTOR_URL = `${config.apiBaseUrl.replace(/\/api\/?$/, '')}/mcp`;

function ClaudeLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.02 3h-3.4l6.06 18H22L16.02 3zM7.94 3 2 21h3.47l1.21-3.87h6.2L14.1 21h3.47L11.6 3H7.94zm-.24 11.06 2.02-6.44 2.02 6.44H7.7z" />
    </svg>
  );
}

function OpenAILogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.99 5.99 0 0 0-4 2.9 6.05 6.05 0 0 0 .75 7.1 5.98 5.98 0 0 0 .51 4.9 6.05 6.05 0 0 0 6.51 2.9A5.98 5.98 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.21 5.99 5.99 0 0 0 4-2.9 6.06 6.06 0 0 0-.75-7.07zm-9.02 12.61a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.79.79 0 0 0 .4-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.5 4.5zm-9.66-4.13a4.47 4.47 0 0 1-.54-3.01l.14.09 4.78 2.76a.77.77 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06L9.74 19.95a4.5 4.5 0 0 1-6.14-1.65zM2.34 7.9a4.48 4.48 0 0 1 2.37-1.97v5.68a.77.77 0 0 0 .39.68l5.81 3.35-2.02 1.17a.08.08 0 0 1-.07 0L4 14.02A4.5 4.5 0 0 1 2.34 7.9zm16.6 3.86-5.83-3.39L15.12 7.2a.08.08 0 0 1 .07 0l4.83 2.79a4.49 4.49 0 0 1-.68 8.1v-5.68a.79.79 0 0 0-.4-.65zm2.01-3.02-.14-.09-4.77-2.79a.78.78 0 0 0-.79 0L9.41 9.23V6.9a.07.07 0 0 1 .03-.06l4.83-2.78a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.15-2.02-1.16a.08.08 0 0 1-.04-.06V6.1a4.5 4.5 0 0 1 7.38-3.45l-.14.08-4.78 2.76a.79.79 0 0 0-.4.68zm1.1-2.37 2.6-1.5 2.6 1.5v3l-2.6 1.5-2.6-1.5z" />
    </svg>
  );
}

const CLIENTS = [
  {
    name: 'Claude',
    settingsUrl: 'https://claude.ai/new#settings/customize-connectors',
    steps: [
      'Open Claude → Settings → Connectors (the button below takes you straight there)',
      'Click "Add custom connector"',
      'Paste the connector URL you copied above, then click Add',
      'Click Connect, sign in, and approve access on the Scripting Smith page that appears',
    ],
  },
  {
    name: 'ChatGPT',
    settingsUrl: 'https://chatgpt.com/#settings',
    steps: [
      'Open ChatGPT → Settings → Connectors. If there is no option to add one, enable Developer mode further down the settings list first',
      'Click the + to add a connector',
      'Name it Scripting Smith, paste the connector URL you copied above, and set Authentication to OAuth',
      'Click Create, then sign in and approve access when prompted',
      'Custom connectors need a paid ChatGPT plan; free accounts can only use published ones',
    ],
  },
];

export default function AIConnectorCard() {
  const [copied, setCopied] = useState(false);
  const [client, setClient] = useState('Claude');
  const user = useAuthStore((s) => s.user);
  const isStaff = Boolean(user?.is_admin);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(CONNECTOR_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
    }
  };

  const selected = CLIENTS.find((c) => c.name === client) ?? CLIENTS[0];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          <CardTitle>AI Assistant</CardTitle>
        </div>
        <CardDescription>
          Connect Claude or ChatGPT to Scripting Smith and it becomes a tutor that can see
          your actual work — your labs, your code, and every run you have made — instead of
          guessing from what you paste into it.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
          <code className="text-sm flex-1 break-all select-all">{CONNECTOR_URL}</code>
          <Button variant="outline" size="sm" onClick={copyUrl} className="shrink-0">
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            <span className="ml-1">{copied ? 'Copied' : 'Copy'}</span>
          </Button>
        </div>

        <div className="flex gap-2">
          {CLIENTS.map((c) => (
            <Button
              key={c.name}
              variant={client === c.name ? 'default' : 'outline'}
              size="sm"
              onClick={() => setClient(c.name)}
            >
              {c.name === 'Claude' ? (
                <ClaudeLogo className="h-4 w-4 mr-1" />
              ) : (
                <OpenAILogo className="h-4 w-4 mr-1" />
              )}
              {c.name}
            </Button>
          ))}
        </div>

        <div className="space-y-3">
          <ol className="text-sm space-y-2 list-decimal pl-5 text-muted-foreground">
            {selected.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <Button
            size="sm"
            onClick={() => {
              copyUrl();
              window.open(selected.settingsUrl, '_blank', 'noopener');
            }}
          >
            Copy URL &amp; open {selected.name} settings
          </Button>
        </div>

        <div className="rounded-lg border p-4 space-y-2 text-sm">
          <p className="font-medium">What it can see</p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>Your labs, your code, and what happened on every run</li>
            <li>Which tests pass, and the errors you hit most across labs</li>
            {isStaff && (
              <li>
                For teaching staff: analytics, gradebooks and submitted work for the
                classrooms you teach — and nothing outside them
              </li>
            )}
          </ul>
          <p className="font-medium pt-1">What it will not do</p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>Give you the answer to a lab. It is built to ask questions, not hand over code</li>
            <li>See anyone else&apos;s work{isStaff ? ' outside your own classrooms' : ''}</li>
            <li>Change, submit or delete anything on your behalf</li>
          </ul>
        </div>

        <p className="text-xs text-muted-foreground">
          You approve the connection on a Scripting Smith page that names the account it is
          linking, so you can always see which assistant is asking. Changing your password
          disconnects every assistant.
        </p>
      </CardContent>
    </Card>
  );
}
