# Security Policy

AILogTrace stores prompts and diffs from AI coding sessions, so the audit store is itself
sensitive. We take that seriously.

## Reporting a vulnerability

Please report security issues **privately**, not via public GitHub issues:

- Email: **security@architonixlabs.com** (or open a private GitHub Security Advisory on the repo).
- Include: what you found, how to reproduce it, and the potential impact.
- We aim to acknowledge within a few business days and to coordinate a fix and disclosure timeline
  with you.

## Scope we especially care about

- **Secret leakage into the store.** Redaction runs before persistence and is fail-closed; any path
  by which a raw secret (API key, private key, credential) reaches `~/.ailogtrace/audit.db` is a
  high-severity bug.
- **Tampering / integrity.** The `events` table is append-only and hash-chained; report anything
  that lets history be silently rewritten without `ailogtrace verify` detecting it.
- **Unexpected egress.** AILogTrace is local-only by design. Any network call that sends captured
  data off the machine (outside an explicitly opt-in feature) is a bug.
- **Capture affecting the agent.** The hook must never block, crash, or alter the agent's behavior.

## Threat model & honest limits

- **Tamper-evident, not tamper-proof.** A local attacker who already has your OS user account and
  the database can rewrite it; the hash chain makes that *detectable* (`ailogtrace verify`), not
  impossible. True immutability is a future server/WORM tier.
- **Encryption at rest is not yet implemented** in this MVP. The store is a normal SQLite file with
  OS-user file permissions as the boundary. Treat `~/.ailogtrace/` as sensitive.
- **Summaries can be sensitive.** Even with secrets redacted, prompts and diffs can carry business
  context. Redaction reduces risk; it does not eliminate it.
- **No keystroke/screen/clipboard capture, ever.** AILogTrace only reads what Claude Code already
  exposes through hooks and transcripts.

## Supported versions

This is pre-1.0 software (`0.1.x`, MVP). Security fixes land on the latest `main`.
