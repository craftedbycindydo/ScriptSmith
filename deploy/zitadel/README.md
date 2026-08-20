# Zitadel on Railway — deployment runbook

Zitadel replaces the custom auth in `backend/app/services/auth.py` + `security.py`.
It owns credentials only; `users.id` and all app data stay in the app database.

## Topology: 2 services

| Service | What |
|---|---|
| `Zitadel` (new) | `ghcr.io/zitadel/zitadel` — API + built-in login UI |
| `Postgres` (existing) | Zitadel creates its own `zitadel` database and user on the existing instance |

The separate Login-V2 container is **not** used. Fresh v4 installs default
`loginV2.required = true`; we set it to `false` after first boot so the built-in
login serves at `/ui/login`. Verified working on v4.16.2 and v4.17.1.

## Prerequisites

1. DNS: `CNAME auth.scriptingsmith.com -> <railway-generated-domain>`
   `ZITADEL_EXTERNALDOMAIN` is baked into the instance at init and is painful to
   change afterwards. Decide the domain **before** first boot.
2. A 32-character master key. Generate with:
   `openssl rand -base64 24 | head -c 32`
   Losing this makes all stored secrets unrecoverable. Save it somewhere durable.

## Service settings

- **Image**: `ghcr.io/zitadel/zitadel:v4.17.1` — pin it; do not use `latest`
- **Start command**:
  `start-from-init --masterkeyFromEnv --tlsMode external`
  `tlsMode external` because Railway terminates TLS at the edge.

## Environment variables

See `railway.env.example`. The one that the whole user migration depends on:

```
ZITADEL_SYSTEMDEFAULTS_PASSWORDHASHER_VERIFIERS=argon2,bcrypt
```

Without it Zitadel only enables bcrypt and every imported argon2id hash fails to
verify — all 96 users locked out. Proven necessary and sufficient in the spike.

## Post-boot steps

1. Disable Login V2 so the built-in login serves:
   `PUT /v2/features/instance  {"loginV2": {"required": false}}`
2. Configure SMTP in the console (Settings → Notifications → SMTP). Deliberately
   not set via env vars here — the `ZITADEL_DEFAULTINSTANCE_SMTPCONFIGURATION_*`
   key names are unverified. Values come from the Backend service env.
3. Send a test email. The existing SMTP credentials have **never been exercised**
   — the app has no email-sending code at all — so treat them as unproven.
4. Create the app's OIDC application (Auth Code + PKCE) and note the client ID.
5. Run the user import (`deploy/zitadel/import_users.py`).

## Rollback

Nothing about deploying Zitadel changes the existing app. The backend keeps its
own auth until the JWKS swap is deployed. To abort: delete the Zitadel service.

---

# MCP connector

Students add `https://backend-production-964a.up.railway.app/mcp` as a custom
connector in Claude or ChatGPT and get a tutor with read access to their own
labs, code and run history. Teaching staff additionally get classroom
analytics, gradebook reads and a sandboxed code runner.

## Who does what

Zitadel is still the identity provider and nothing about the web app's login
changes: it owns the user store, the argon2 hashes, the Google IdP, MFA and the
login page. The backend (`backend/app/mcp/`) is the OAuth authorization server
*for the connector only*, because three things are needed that Zitadel cannot
give us:

- a registration endpoint an AI client can talk to before any user exists,
- a consent screen we control, showing the account holder's name and email,
- a token minted for this resource. Zitadel
  [accepts but ignores](https://zitadel.com/docs/guides/integrate/dynamic-client-registration)
  the RFC 8707 `resource` parameter, so a Zitadel-minted token carries an
  audience shared by every client registered on the instance.

The redirect chain, with the login still happening at Zitadel:

```
client  -> /mcp/oauth/authorize          validate client, stash the request
        -> zitadel /oauth/v2/authorize   the login, exactly as the web app does it
        -> /mcp/oauth/callback           verify Zitadel's token, resolve users.id
        -> FRONTEND/mcp/connect          consent: account name, email, client name
        -> /mcp/oauth/approve            one-time code
        -> client                        exchanges it at /mcp/oauth/token
```

Connector tokens carry `scope=mcp`. `app/routers/auth.py` refuses that scope, so
a connector token cannot be replayed against the browser API, and bumping
`users.token_version` revokes both at once.

## Setup

1. **Create a Zitadel application** for the connector's login leg: an OIDC web
   app, Authorization Code + PKCE, no secret, with one redirect URI:

   ```
   https://backend-production-964a.up.railway.app/mcp/oauth/callback
   ```

2. **Set the backend variables** on the Railway `Backend` service:

   ```
   ZITADEL_MCP_CLIENT_ID=<the client id from step 1>
   API_BASE_URL=https://backend-production-964a.up.railway.app
   ```

   An empty `ZITADEL_MCP_CLIENT_ID` leaves `/mcp` and the discovery routes
   unregistered, so the connector is off by default. `API_BASE_URL` only builds
   the absolute URLs in the discovery documents and falls back to the request
   host if unset. There is no `api.scriptingsmith.com`; the backend is served on
   its Railway-generated domain, which is also what the frontend targets.

   The `mcp_oauth_clients` table is created by `Base.metadata.create_all` at
   startup, like every other table here. No migration step.

3. **Verify**, in order:

   ```
   curl -s https://backend-production-964a.up.railway.app/.well-known/oauth-protected-resource/mcp
   curl -s https://backend-production-964a.up.railway.app/.well-known/oauth-authorization-server
   curl -si -X POST https://backend-production-964a.up.railway.app/mcp \
        -H 'content-type: application/json' \
        -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -20
   ```

   The first names the backend under `authorization_servers`, the second
   advertises `/mcp/oauth/authorize` and `/mcp/oauth/register`, and the third
   must be a 401 carrying `WWW-Authenticate: Bearer resource_metadata="..."`.
   Those three responses are the whole discovery chain a client walks.

4. **Add the connector** in Claude (Settings → Connectors → Add custom
   connector) or ChatGPT. The student signs in through the normal Zitadel login
   and lands on the consent screen. A Zitadel account with no matching
   `users.zitadel_user_id` is refused — the connector reads accounts, it never
   creates them.

## Zitadel dynamic client registration: turn it back off

On 2026-08-19 the instance was upgraded to `v4.17.1` and instance-wide
unauthenticated DCR was enabled, for a design where Zitadel was going to be the
connector's authorization server. That design was replaced by the one above,
which registers clients against the backend instead, so Zitadel's DCR is no
longer used by anything and should be disabled again:

```
PUT https://auth.scriptingsmith.com/v2/settings/security
Authorization: Bearer <token with instance permission>
Content-Type: application/json

{"embeddedIframe": {}, "dynamicClientRegistration": {"enabled": false}}
```

`embeddedIframe` is passed explicitly because the PUT writes the whole settings
object — omitting a field resets it. Read the current value with a GET on the
same path first.

Leaving it enabled means anyone who can reach `auth.scriptingsmith.com` can
register an OAuth client with an attacker-chosen display name. They still could
not get a token without a real user completing a real login, but there is no
longer any reason to carry that exposure. The v4.17.1 upgrade itself is fine to
keep.

## What this trades away

Known and accepted, not oversights:

- **The backend mints connector tokens**, so it is a credential issuer as well
  as a resource server. That is what buys audience control and the consent
  screen. Refresh tokens are stateless JWTs, matching how `app/routers/auth.py`
  already works — revocation is `users.token_version`, not a per-connection
  kill switch.
- **The consent request id is the capability.** It is 32 random bytes, handed
  only to the person's own browser by the Zitadel redirect, valid ten minutes,
  and consumed on approval — the same terms as an authorization code. Approval
  can only redirect to the client's pre-registered `redirect_uri`, so a stolen
  id buys the connection the user was already making.
- **No Client ID Metadata Document support.** ChatGPT is reported to prefer
  CIMD over RFC 7591 registration. It was written and then cut as speculation:
  nothing here has been tested against ChatGPT yet. If its connector refuses
  plain DCR, that is the first thing to add back.
- **Rate limiting is the app's global middleware**, which reads
  `request.client.host` with no `X-Forwarded-For` handling — behind Railway
  every caller already shares one bucket. Connector traffic will lean on it.
