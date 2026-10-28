---
description: Review uncommitted changes against the SECURITY_STANDARDS Security Gate
---

# /security-check — Security Gate Review

Review the current uncommitted changes (`git diff`) against the Security Gate in
`.claude/SECURITY_STANDARDS.md`.

1. Run `git diff` (and `git status --short` for untracked files) to collect the change set.
2. Check each item of the Security Gate: secrets exposure, input validation, authN/authZ, dependencies, error handling, dev-only gating, least privilege, security tests, `.env.example`/docs updates.
3. Report findings by severity (High / Medium / Low / Pass) with file and line references.
4. Do not auto-fix without asking. If a secret or vulnerability is found, stop and escalate per the Incident Handling section.
