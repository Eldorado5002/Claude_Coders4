"""Redact personal / secret data before anything is written to memory.

Clerks type free-text reasons; a phone number, full bank account or PAN must never
become a permanent memory. Runs locally, before data leaves our server.
Masked accounts (XXXXXX4521), GSTINs, IFSC codes, invoice and PO numbers are kept.
"""

import re

PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("email", re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.]+\b")),
    ("upi", re.compile(r"\b[\w.-]{2,}@(?:ok\w+|ybl|ibl|axl|upi|paytm|apl)\b", re.I)),
    ("card", re.compile(r"\b(?:\d{4}[ -]){3}\d{4}\b")),
    ("aadhaar", re.compile(r"\b\d{4}[ -]\d{4}[ -]\d{4}\b")),
    ("phone", re.compile(r"(?<![\w/-])(?:\+91[ -]?|0)?[6-9]\d{4}[ -]?\d{5}(?![\w/-])")),
    ("bank_account", re.compile(r"(?<![\w/-])\d{9,18}(?![\w/-])")),
    ("pan", re.compile(r"(?<![A-Z0-9])[A-Z]{5}\d{4}[A-Z](?![A-Z0-9])")),
]


def redact(text: str) -> tuple[str, list[str]]:
    """Return (clean text, list of redacted kinds)."""
    found: list[str] = []
    for kind, rx in PATTERNS:
        text, n = rx.subn(f"[REDACTED:{kind}]", text)
        if n:
            found.append(kind)
    return text, found
