# V3.9 — Implementation plan

Release `v3.9.0` — implemented; one commit for the code, one for screenshots/docs.

## Code

1. Battle snapshot:
   - truncate the relative-gap canvas at the snapshot `t`;
   - filter lap-pace rows to the snapshot lap;
   - filter overtakes after the snapshot;
   - apply the same lap limit to the full-view pace modal;
   - add a scope note explaining what freezes.
2. Driver images:
   - key ready/failed state by driver number + URL;
   - keep the number fallback until the image is ready;
   - handle quick driver switching without a stale blank image.
3. Share card: no code change unless verification finds a remaining geometry bug.

## Verification

- Pure tests for window resolvers and share-card layout.
- Browser: switch two drivers and confirm both headshots load; snapshot at an
  early lap shortens the pace rows and changes the gap chart end; Back to replay
  restores the full rows; share-card download is 1200×630 with cars on track.
- 89 pytest + 74 vitest; tsc/build; browser checks; no page errors.
- Update README, ARCHITECTURE, TESTING, state and affected screenshots; tag
  `v3.9.0` and deploy.
