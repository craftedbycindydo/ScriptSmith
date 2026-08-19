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

# MCP connector — Zitadel as the authorization server

Students add `https://backend-production-964a.up.railway.app/mcp` as a custom connector in
Claude or ChatGPT and get a tutor with read access to their own labs, code and
run history. The backend (`backend/app/mcp/`) is an OAuth 2.1 **resource
server** only: it issues no tokens and stores no credentials. Zitadel runs the
login, the consent and the client registration.

## Why this needed a Zitadel upgrade

MCP clients register themselves before any user exists, so the authorization
server must support RFC 7591 dynamic client registration. Zitadel added it in
[#12313](https://github.com/zitadel/zitadel/pull/12313), first released in
**v4.17.0** (2026-08-12). The instance ran v4.16.2, which had none of it:

| Endpoint | v4.16.2 | v4.17.1 + DCR enabled |
|---|---|---|
| `/.well-known/openid-configuration` → `registration_endpoint` | absent | `https://auth.scriptingsmith.com/oauth/v2/register` |
| `/oauth/v2/register` (GET) | 404 | 405 (route exists, POST only) |
| `POST /oauth/v2/register`, no auth | 404 | 201 |

`/.well-known/oauth-authorization-server` is still 404 on v4.17.1 — Zitadel
serves OIDC discovery only. See the trade-offs below.

## What is already done

Applied to production on 2026-08-19, in this order:

1. **Zitadel upgraded** to `ghcr.io/zitadel/zitadel:v4.17.1`. Boot log showed
   `setup completed` then `server is listening`, no errors. The start command
   is unchanged.

2. **Dynamic client registration enabled**, instance-wide and unauthenticated:

   ```
   PUT https://auth.scriptingsmith.com/v2/settings/security
   Authorization: Bearer <token with instance permission>
   Content-Type: application/json

   {"embeddedIframe": {}, "dynamicClientRegistration": {"enabled": true, "allowUnauthenticated": true}}
   ```

   `embeddedIframe` is passed explicitly because the PUT writes the whole
   settings object — omitting a field resets it. Read the current value with a
   GET on the same path before changing anything here.

   The `MIGRATION_PAT` variable on the Zitadel service has enough permission
   for this; it does not need a fresh IAM_OWNER token.

3. **DCR project provisioned.** Zitadel creates the `ZITADEL DCR` project
   lazily, on the first registration — before that it does not appear in a
   project search. It was forced into existence with a throwaway client
   registration, which was then deleted through its RFC 7592
   `registration_client_uri` (204, then 404 on re-read).

   ```
   ZITADEL DCR project id: 387026207939496474
   ```

## Remaining steps

4. **Deploy the backend** with `backend/app/mcp/` on it. Until then the code
   simply is not there; setting the variables below changes nothing.

5. **Set the backend variables** on the Railway `Backend` service:

   ```
   ZITADEL_MCP_PROJECT_ID=387026207939496474
   API_BASE_URL=https://backend-production-964a.up.railway.app
   ```

   `ZITADEL_MCP_PROJECT_ID` is the audience the connector demands: a token
   without it in `aud` is rejected, and leaving it empty keeps `/mcp` and the
   discovery routes unregistered. `API_BASE_URL` only builds the absolute URLs
   in the discovery document, and falls back to the request host if unset.

   There is no `api.scriptingsmith.com`; the backend is served on its
   Railway-generated domain, which is also what the frontend targets
   (`VITE_API_BASE_URL=https://${{backend.RAILWAY_PUBLIC_DOMAIN}}`). A custom
   API domain would make a friendlier connector URL, but nothing depends on it.

6. **Verify**, in order:

   ```
   curl -s https://backend-production-964a.up.railway.app/.well-known/oauth-protected-resource/mcp
   curl -si -X POST https://backend-production-964a.up.railway.app/mcp \
        -H 'content-type: application/json' \
        -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -20
   ```

   The first must name the Zitadel issuer under `authorization_servers`; the
   second must be a 401 carrying
   `WWW-Authenticate: Bearer resource_metadata="..."`. Those two responses are
   the whole discovery chain a client walks.

7. **Add the connector** in Claude (Settings → Connectors → Add custom
   connector) or ChatGPT, with the URL
   `https://backend-production-964a.up.railway.app/mcp`. The student signs in
   through the normal Zitadel login. A Zitadel account with no matching
   `users.zitadel_user_id` is refused — the connector reads accounts, it never
   creates them.

## What this trades away

Known and accepted, not oversights:

- **Open registration is instance-wide, and it is now on.** Anyone who can
  reach `auth.scriptingsmith.com` can register an OAuth client — verified, an
  unauthenticated POST returns 201. They still cannot get a token without a
  real user completing a real Zitadel login, but the client name on the consent
  screen is attacker-controlled. Turn it off by PUTting the same settings
  endpoint with `"enabled": false`.
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
