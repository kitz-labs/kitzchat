# Production VPS Configuration

This deployment is production-first and uses fixed domains.

## Canonical Domains

- **Primary (canonical):** `https://dashboard.aikitz.at`
- **Secondary UI:** `https://nexora.aikitz.at`

Auth-sensitive flows (OAuth, verify email, magic links, password reset) are aligned to the canonical domain.
Passkey flows use the real request origin via forwarded headers, because WebAuthn must match the actual origin.

## Required Production ENV (minimum)

- `PUBLIC_BASE_URL=https://dashboard.aikitz.at`
- `APP_URL=https://dashboard.aikitz.at`
- `KITZCHAT_HOST_LOCK=dashboard.aikitz.at,nexora.aikitz.at`
- `AUTH_COOKIE_SECURE=true`

## Notes

- UI pages can be visited on both domains, but absolute/auth links always resolve to `dashboard.aikitz.at`.
- Localhost / IP-based access is not intended for production.
- Keep reverse proxy `X-Forwarded-*` headers enabled so request origins are detected correctly.
