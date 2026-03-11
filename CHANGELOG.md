# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning.

## [0.2.0] - 2026-03-04

### Added
- MIT release scaffolding (`LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, third-party notices).
- Playwright E2E baseline and CI gates for unit + E2E checks.

### Changed
- Added route-level API auth checks for defense-in-depth on protected routes.
- Added configurable host lock (`KITZCHAT_HOST_LOCK`) with secure local-first default for local agent workspace workflows.
- Hardened template safety by removing org-specific residue and sanitizing seeded/demo data.

### Security
- Remediated production dependency audit findings via `minimatch` override and verified clean `pnpm audit`.
