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
login serves at `/ui/login`. Verified working on v4.16.2.

## Prerequisites

1. DNS: `CNAME auth.scriptingsmith.com -> <railway-generated-domain>`
   `ZITADEL_EXTERNALDOMAIN` is baked into the instance at init and is painful to
   change afterwards. Decide the domain **before** first boot.
2. A 32-character master key. Generate with:
   `openssl rand -base64 24 | head -c 32`
   Losing this makes all stored secrets unrecoverable. Save it somewhere durable.

## Service settings

- **Image**: `ghcr.io/zitadel/zitadel:v4.16.2` — pin it; do not use `latest`
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

# MCP connector — Zitadel as the authorization server

Students add `https://api.scriptingsmith.com/mcp` as a custom connector in
Claude or ChatGPT and get a tutor with read access to their own labs, code and
run history. The backend (`backend/app/mcp/`) is an OAuth 2.1 **resource
server** only: it issues no tokens and stores no credentials. Zitadel runs the
login, the consent and the client registration.

## Why this needs a Zitadel upgrade

MCP clients register themselves before any user exists, so the authorization
server must support RFC 7591 dynamic client registration. Zitadel added it in
[#12313](https://github.com/zitadel/zitadel/pull/12313), first released in
**v4.17.0** (2026-08-12). Probed against the live instance on 2026-08-19, the
pinned v4.16.2 has none of it:

| Endpoint | v4.16.2 |
|---|---|
| `/.well-known/openid-configuration` | 200, but no `registration_endpoint` |
| `/.well-known/oauth-authorization-server` | 404 |
| `/oauth/v2/register` | 404 |

Until the upgrade lands, leave `ZITADEL_MCP_PROJECT_ID` empty; the backend then
never registers the `/mcp` routes at all and nothing else changes.

## Steps

1. **Upgrade Zitadel** to `ghcr.io/zitadel/zitadel:v4.17.1` or later. Same
   caveats as any Zitadel bump: pin the tag, keep the master key, watch the
   first boot log for a migration.

2. **Enable dynamic client registration.** Off by default, and it must run in
   open mode — Claude and ChatGPT register with no bearer token of their own:

   ```
   PUT ${CUSTOM_DOMAIN}/v2/settings/security
   Authorization: Bearer <IAM_OWNER token>
   Content-Type: application/json

   {"dynamicClientRegistration": {"enabled": true, "allowUnauthenticated": true}}
   ```

   Confirm with `curl -s -o /dev/null -w '%{http_code}' https://auth.scriptingsmith.com/oauth/v2/register`
   — it should stop returning 404.

3. **Find the DCR project id.** Zitadel auto-provisions a project named
   `ZITADEL DCR` in the default organisation and puts every dynamically
   registered client in it. Copy its id from the console.

4. **Set the backend variables** on the Railway `Backend` service:

   ```
   ZITADEL_MCP_PROJECT_ID=<the ZITADEL DCR project id>
   API_BASE_URL=https://api.scriptingsmith.com
   ```

   `ZITADEL_MCP_PROJECT_ID` is the audience the connector demands: a token
   without it in `aud` is rejected. `API_BASE_URL` only builds the absolute
   URLs in the discovery document, and falls back to the request host if unset.

5. **Verify**, in order:

   ```
   curl -s https://api.scriptingsmith.com/.well-known/oauth-protected-resource/mcp
   curl -si -X POST https://api.scriptingsmith.com/mcp \
        -H 'content-type: application/json' \
        -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -20
   ```

   The first must name the Zitadel issuer under `authorization_servers`; the
   second must be a 401 carrying
   `WWW-Authenticate: Bearer resource_metadata="..."`. Those two responses are
   the whole discovery chain a client walks.

6. **Add the connector** in Claude (Settings → Connectors → Add custom
   connector) or ChatGPT, with the URL `https://api.scriptingsmith.com/mcp`.
   The student signs in through the normal Zitadel login. A Zitadel account
   with no matching `users.zitadel_user_id` is refused — the connector reads
   accounts, it never creates them.

## What this trades away

Known and accepted, not oversights:

- **Open registration is instance-wide.** Anyone who can reach
  `auth.scriptingsmith.com` can register an OAuth client. They still cannot get
  a token without a real user completing a real Zitadel login, but the client
  name on the consent screen is attacker-controlled.
- **The audience is shared.** Zitadel puts every client id in the DCR project,
  plus the project id, into `aud`, and it
  [accepts but ignores](https://zitadel.com/docs/guides/integrate/dynamic-client-registration)
  the RFC 8707 `resource` parameter. So a token minted for one dynamically
  registered client validates at this connector too. That is weaker than the
  MCP spec's "issued specifically for them", and it is the price of delegating
  to Zitadel rather than running our own authorization server.
- **No RFC 8414 document.** Zitadel serves OIDC discovery but nothing at
  `/.well-known/oauth-authorization-server`, which is the path MCP clients try
  first. Claude and ChatGPT both fall back to `/.well-known/openid-configuration`;
  a client that does not will fail to discover the token endpoint.
- **JWT access tokens are assumed.** `backend/app/mcp/auth.py` verifies tokens
  locally against Zitadel's JWKS. If dynamically registered clients turn out to
  receive opaque tokens, that file needs an RFC 7662 introspection path (and a
  client secret for this resource server) — there is a `ponytail:` comment
  marking the spot.
