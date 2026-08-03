"""
Import app users into Zitadel, carrying their existing argon2id password hashes.

Zitadel verifies those hashes directly (requires
ZITADEL_SYSTEMDEFAULTS_PASSWORDHASHER_VERIFIERS=argon2,bcrypt), so nobody is
forced to reset a password. Proven end-to-end before this was written.

Idempotent: users that already carry a zitadel_user_id are skipped, so a partial
run can simply be re-run.

  DRY RUN :  python import_users.py
  APPLY   :  python import_users.py --apply
"""
import argparse
import json
import os
import subprocess
import sys

import psycopg2
import psycopg2.extras

ZITADEL = "https://auth.scriptingsmith.com"


def api(method, path, token, resolve_ip, body=None):
    cmd = ["curl", "-s", "--max-time", "40", "-X", method,
           "--resolve", f"auth.scriptingsmith.com:443:{resolve_ip}",
           "-H", f"Authorization: Bearer {token}",
           "-H", "Content-Type: application/json"]
    if body is not None:
        cmd += ["-d", json.dumps(body)]
    cmd += [f"{ZITADEL}{path}"]
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    try:
        return json.loads(out or "{}")
    except json.JSONDecodeError:
        return {"_raw": out[:300]}


def split_name(full_name, username):
    """Zitadel requires non-empty given and family names."""
    if full_name and full_name.strip():
        parts = full_name.strip().split()
        if len(parts) >= 2:
            return parts[0], " ".join(parts[1:])
        return parts[0], parts[0]
    return username, username


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="actually write; otherwise dry run")
    args = ap.parse_args()

    db_url = os.environ["APP_DATABASE_URL"]
    token = os.environ["ZITADEL_PAT"]
    resolve_ip = os.environ["ZITADEL_IP"]

    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    # Only active users. Inactive rows (e.g. the merged duplicate) cannot log in
    # and are deliberately left without a Zitadel identity.
    cur.execute("""
        SELECT id, email, username, full_name, hashed_password, is_active, zitadel_user_id
        FROM users
        WHERE is_active = true
        ORDER BY id
    """)
    rows = cur.fetchall()

    cur.execute("SELECT COUNT(*) FROM users WHERE is_active = false")
    inactive = cur.fetchone()[0]

    print(f"active users to import : {len(rows)}")
    print(f"inactive users skipped : {inactive}")
    print(f"mode                   : {'APPLY' if args.apply else 'DRY RUN'}\n")

    created = skipped = failed = 0
    failures = []

    for r in rows:
        if r["zitadel_user_id"]:
            skipped += 1
            continue

        if not r["hashed_password"] or not r["hashed_password"].startswith("$argon2"):
            failed += 1
            failures.append((r["id"], "unexpected hash format"))
            continue

        given, family = split_name(r["full_name"], r["username"])
        payload = {
            "username": r["email"],                     # students sign in with their email
            "profile": {"givenName": given, "familyName": family},
            "email": {"email": r["email"], "isVerified": True},
            "hashedPassword": {"hash": r["hashed_password"]},
        }

        if not args.apply:
            created += 1
            continue

        res = api("POST", "/v2/users/human", token, resolve_ip, payload)
        uid = res.get("userId")
        if uid:
            cur.execute("UPDATE users SET zitadel_user_id = %s WHERE id = %s", (uid, r["id"]))
            created += 1
        else:
            failed += 1
            failures.append((r["id"], json.dumps(res)[:160]))

    if args.apply:
        conn.commit()

    print(f"created : {created}")
    print(f"skipped : {skipped} (already linked)")
    print(f"failed  : {failed}")
    for uid, err in failures[:10]:
        print(f"   user {uid}: {err}")

    conn.close()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
