# MyLife360 backend (Home Assistant add-on)

The server side of the MyLife360 family app; the app lives in
`../../AndroidApp` (read its `CLAUDE.md` for the shared rules: family,
product decisions, secrets, git). This repository also holds other projects
(e.g. `myfinanceapp`): touch only `traccar-backend/` for MyLife360.

## Shipping a change

Home Assistant only offers an update when the add-on version changes. Every
backend change that should reach Home Assistant:

1. Bump `version` in `config.yaml` and `io.hass.version` in `Dockerfile`
   (patch number +1).
2. Add an entry at the top of `CHANGELOG.md`, in plain words for the user
   (what changes for the family, not the code).
3. Commit on `main`. Push when the user asks (or as part of an app release).

App releases are committed here by the app's release workflow
(`app/apk/` + a version bump): pull before working.

## Checking

- Tests: `pip install -r app/requirements.txt -r app/tests/requirements-test.txt`,
  then `PYTHONPATH=. pytest -q`. Every fix gets a test; Traccar is mocked with
  respx.
- The image is the Home Assistant base pinned to Alpine 3.24 (Python 3.14),
  packages in `/opt/venv`; CI runs Python 3.14. A dependency or base-image
  change: build it with `docker build` and run the tests inside.
- `app/tests/fixtures/stream_messages.json` is the live-stream contract,
  shared with the app's test resources: change both copies together.

## Rules learnt the hard way

- Never log secrets: httpx request logging stays at WARNING (Traccar's
  session URL carries the admin token).
- The admin panel (`app/routers/admin.py`) is reachable through Home
  Assistant ingress only; escape everything with `_e`, and never build
  JavaScript from data (pass it through `data-` attributes).
- Device tokens are stored hashed; enrolment codes are compared in constant
  time; positions dated in the future are clamped.
- Detection never waits for Traccar: positions are processed, then queued in
  the outbox for Traccar.
- Traccar's reports longer than one day (`report.fastThreshold`) leave
  `maxSpeed` at 0: ask for a day or less at a time.
