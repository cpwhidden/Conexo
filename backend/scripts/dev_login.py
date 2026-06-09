#!/usr/bin/env python
"""Mint a local dev JWT for browser testing behind Google OAuth.

The app authenticates by storing a backend-issued JWT in localStorage under
``access_token`` (see frontend/src/api/client.ts). That token is just
``{"sub": <user_id>, "exp": ...}`` signed with ``CONEXO_JWT_SECRET_KEY``.

This script reuses the app's own ``create_access_token`` so the token is
guaranteed valid, picks an existing local-DB user (or seeds a dev user when
the DB is empty), and prints the token plus a paste-ready browser snippet.

Usage (from backend/, venv active):
    python scripts/dev_login.py              # first user, or seed one
    python scripts/dev_login.py --email you@example.com   # specific user
    python scripts/dev_login.py --admin      # ensure the chosen user is admin

Local dev only: requires CONEXO_DATABASE_URL to point at your local Postgres.
"""

import argparse
import asyncio
import sys
from pathlib import Path

# Allow running as `python scripts/dev_login.py` from backend/ without PYTHONPATH.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.core.database import async_session
from app.core.security import create_access_token
from app.models.user import User


async def _resolve_user(email: str | None, make_admin: bool) -> User:
    async with async_session() as db:
        if email:
            user = (
                await db.execute(select(User).where(User.email == email))
            ).scalar_one_or_none()
            if user is None:
                user = User(
                    email=email,
                    name=email.split("@")[0],
                    google_id=f"dev-{email}",
                    is_admin=make_admin,
                )
                db.add(user)
        else:
            user = (
                await db.execute(select(User).order_by(User.created_at))
            ).scalars().first()
            if user is None:
                user = User(
                    email="dev@conexo.local",
                    name="Dev User",
                    google_id="dev-local",
                    is_admin=make_admin,
                )
                db.add(user)

        if make_admin and not user.is_admin:
            user.is_admin = True

        await db.commit()
        await db.refresh(user)
        return user


def main() -> int:
    parser = argparse.ArgumentParser(description="Mint a local dev JWT.")
    parser.add_argument("--email", help="Target user email (created if missing).")
    parser.add_argument(
        "--admin", action="store_true", help="Ensure the user has admin rights."
    )
    args = parser.parse_args()

    user = asyncio.run(_resolve_user(args.email, args.admin))
    token = create_access_token(str(user.id))

    print(f"\nUser:  {user.name} <{user.email}>  admin={user.is_admin}")
    print(f"\nToken:\n{token}")
    print("\nBrowser console snippet (run on the dev-server origin, then reload):")
    print(f'  localStorage.setItem("access_token", "{token}"); location.reload();\n')
    return 0


if __name__ == "__main__":
    sys.exit(main())
