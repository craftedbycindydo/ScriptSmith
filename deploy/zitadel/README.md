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
