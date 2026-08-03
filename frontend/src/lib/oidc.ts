const ISSUER = import.meta.env.VITE_ZITADEL_ISSUER ?? '';
const CLIENT_ID = import.meta.env.VITE_ZITADEL_CLIENT_ID ?? '';
const REDIRECT_URI = `${window.location.origin}/auth/callback`;

const VERIFIER_KEY = 'oidc_code_verifier';
const STATE_KEY = 'oidc_state';
const RETURN_KEY = 'oidc_return_to';

export function isOidcConfigured(): boolean {
  return Boolean(ISSUER && CLIENT_ID);
}

function randomString(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

function base64UrlEncode(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(digest);
}

export async function beginLogin(returnTo: string = '/'): Promise<void> {
  if (!isOidcConfigured()) return;

  const verifier = randomString();
  const state = randomString(16);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(RETURN_KEY, returnTo);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid profile email offline_access',
    code_challenge: await challengeFor(verifier),
    code_challenge_method: 'S256',
    state,
  });

  window.location.assign(`${ISSUER}/oauth/v2/authorize?${params}`);
}

export interface OidcTokens {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
}

export async function refreshTokens(refreshToken: string): Promise<OidcTokens> {
  const res = await fetch(`${ISSUER}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
  return res.json();
}

export function endSessionUrl(idToken?: string): string {
  const params = new URLSearchParams({
    post_logout_redirect_uri: `${window.location.origin}/`,
  });
  if (idToken) params.set('id_token_hint', idToken);
  return `${ISSUER}/oidc/v1/end_session?${params}`;
}

export async function completeLogin(search: string): Promise<{ tokens: OidcTokens; returnTo: string }> {
  const params = new URLSearchParams(search);

  const error = params.get('error');
  if (error) {
    throw new Error(params.get('error_description') || error);
  }

  const code = params.get('code');
  const state = params.get('state');
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const expectedState = sessionStorage.getItem(STATE_KEY);
  const returnTo = sessionStorage.getItem(RETURN_KEY) || '/';

  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(RETURN_KEY);

  if (!code || !verifier) throw new Error('Login response was incomplete. Please try again.');
  if (!state || state !== expectedState) throw new Error('Login state mismatch. Please try again.');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code,
    code_verifier: verifier,
  });

  const res = await fetch(`${ISSUER}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status})`);
  }

  return { tokens: await res.json(), returnTo };
}
