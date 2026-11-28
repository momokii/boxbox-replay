"""Deployment config guards for the public Cloudflare Tunnel.

These are static checks on the files that are not otherwise exercised by the
Python test suite. They protect the two security decisions that are easy to
undo accidentally: who may supply CF-Connecting-IP, and which third-party
origins the CSP permits.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NGINX = (ROOT / "web" / "nginx.conf").read_text(encoding="utf-8")
HEADERS = (ROOT / "web" / "security-headers.conf").read_text(encoding="utf-8")


def test_cloudflare_proxy_trust_is_one_gateway() -> None:
    assert "172.23.0.1 1;" in NGINX
    assert "~^172\\." not in NGINX
    assert "proxy_set_header X-Real-IP $boxbox_client_ip;" in NGINX


def test_forwarded_for_is_not_appendable_by_the_client() -> None:
    assert "proxy_set_header X-Forwarded-For $boxbox_client_ip;" in NGINX
    assert "$proxy_add_x_forwarded_for" not in NGINX


def test_csp_allows_only_the_cloudflare_analytics_origins() -> None:
    assert "https://static.cloudflareinsights.com" in HEADERS
    assert "https://cloudflareinsights.com" in HEADERS
    assert "script-src 'self' https://static.cloudflareinsights.com" in HEADERS
    assert "connect-src 'self' https://cloudflareinsights.com" in HEADERS
