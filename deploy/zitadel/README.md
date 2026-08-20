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

The backend is the connector's OAuth authorization server. It is *not* an
identity provider and it never sends anyone to one — that is the whole point of
the design:

- Scripting Smith has local email-and-password accounts as well as Zitadel
  ones. Bouncing the connector through Zitadel would lock every password user
  out of it.
- Somebody already signed in to the web app should not have to sign in again
  to connect an assistant.
- Users should never see Zitadel. How the app authenticates people is decided
  on its own login page, and the connector inherits whatever that decides.

So identity comes from the ordinary Scripting Smith session:

```
client  -> /mcp/oauth/authorize     validate client, stash the request
        -> FRONTEND/mcp/connect     consent page, authenticated by the app
                                    session (it sends signed-out visitors to
                                    the app's own /login and back again)
        -> /mcp/oauth/approve       issue a one-time code
        -> client                   exchanges it at /mcp/oauth/token
```

Connector tokens carry `scope=mcp`. `app/routers/auth.py` refuses that scope, so
a connector token cannot be replayed against the browser API, and bumping
`users.token_version` (which a password change does) revokes both at once.

## Setup

There is one variable:

```
API_BASE_URL=https://backend-production-964a.up.railway.app
```

Empty means `/mcp` and its discovery routes are never registered, so this
doubles as the on/off switch. It has to be absolute because MCP clients pin the
values in the discovery documents; guessing from the request host is not good
enough.

`FRONTEND_URL` must point at the web app (`https://scriptingsmith.com`) — the
consent redirect uses it. The `mcp_oauth_clients` table is created by
`Base.metadata.create_all` at startup like every other table; no migration.

Nothing needs creating in Zitadel. An OIDC application called **MCP Connector**
was made during an earlier design that routed the connector's login through
Zitadel; that design is gone, and both the application and any
`ZITADEL_MCP_CLIENT_ID` variable are dead and can be deleted.

### Verify

```
curl -s https://backend-production-964a.up.railway.app/.well-known/oauth-protected-resource/mcp
curl -s https://backend-production-964a.up.railway.app/.well-known/oauth-authorization-server
curl -si -X POST https://backend-production-964a.up.railway.app/mcp \
     -H 'content-type: application/json' \
     -H 'accept: application/json, text/event-stream' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -20
```

The first names the backend under `authorization_servers`, the second
advertises `/mcp/oauth/authorize` and `/mcp/oauth/register`, and the third must
be a 401 carrying `WWW-Authenticate: Bearer resource_metadata="..."`. Those
three are the whole discovery chain a client walks.

Then add the connector in Claude (Settings → Connectors → Add custom connector)
or ChatGPT with the URL `https://backend-production-964a.up.railway.app/mcp`.
The person signs in to Scripting Smith if they are not already, approves on the
consent page, and that is the whole flow. A connector can only ever act as an
account that already exists — it never creates one.

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
- **The consent request id names a connection, not a person.** Approval is
  authenticated by the caller's own Scripting Smith session, so a leaked id
  approves nothing on anyone else's behalf; and approval can only ever redirect
  to the client's pre-registered `redirect_uri`.
- **No Client ID Metadata Document support.** ChatGPT is reported to prefer
  CIMD over RFC 7591 registration. It was written and then cut as speculation:
  nothing here has been tested against ChatGPT yet. If its connector refuses
  plain DCR, that is the first thing to add back.
- **Rate limiting is the app's global middleware**, which reads
  `request.client.host` with no `X-Forwarded-For` handling — behind Railway
  every caller already shares one bucket. Connector traffic will lean on it.
