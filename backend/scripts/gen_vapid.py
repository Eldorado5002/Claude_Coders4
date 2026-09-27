"""Generate VAPID keys for Web Push and write them into backend/.env (private key is never printed).

Run: uv run python -m scripts.gen_vapid [--force]
"""

import argparse
import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from app.config import BACKEND_DIR


def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def main(force: bool) -> None:
    env = BACKEND_DIR / ".env"
    lines = env.read_text(encoding="utf-8").splitlines() if env.exists() else []
    current = dict(l.split("=", 1) for l in lines if "=" in l and not l.lstrip().startswith("#"))
    if current.get("VAPID_PRIVATE_KEY") and not force:
        print("VAPID keys already set (use --force to rotate). Public key:", current.get("VAPID_PUBLIC_KEY"))
        return
    key = ec.generate_private_key(ec.SECP256R1())
    private = b64url(key.private_numbers().private_value.to_bytes(32, "big"))
    public = b64url(key.public_key().public_bytes(serialization.Encoding.X962,
                                                  serialization.PublicFormat.UncompressedPoint))
    updates = {"VAPID_PUBLIC_KEY": public, "VAPID_PRIVATE_KEY": private}
    out, seen = [], set()
    for l in lines:
        k = l.split("=", 1)[0].strip()
        if k in updates:
            out.append(f"{k}={updates[k]}")
            seen.add(k)
        else:
            out.append(l)
    out += [f"{k}={v}" for k, v in updates.items() if k not in seen]
    env.write_text("\n".join(out) + "\n", encoding="utf-8")
    print("VAPID keys written to backend/.env")
    print("Frontend VITE_VAPID_PUBLIC_KEY =", public)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--force", action="store_true")
    main(p.parse_args().force)
