# VPS GTFS scheduler

Deployed on `metrobus-srv` on 2026-10-08. VPS verification dispatched
[run 37751244689](https://github.com/anlexcz/sotofoto/actions/runs/37751244689):
build and deploy succeeded, and the VPS verified new production metadata
(`builtAt=2026-10-08T08:40:53.366663+00:00`). The normal sandboxed service then
correctly skipped today's updated data. The user enabled the timer; its next
activation is 2026-10-09 04:07 CEST. GitHub schedule has been removed.
The first unattended morning activation has not yet been observed.

Python 3.12+ standard library and systemd; no web server, database, npm or GTFS
dataset on the VPS. The server checks Pages metadata and dispatches the existing
`pages.yml` on `main`. GitHub still performs the complete build, tests, releases
and deploy. No existing VPS services are changed.

The installer pins and verifies the scheduler's source SHA-256, asks for a
fine-grained PAT via hidden terminal input, and stores it root-only in
`/etc/sotofoto-gtfs/github-token`. Limit the PAT to `anlexcz/sotofoto` with
Actions read/write and automatic Metadata read. No Contents write is needed.
If the token has an expiration date, record it and replace it before expiration.
The initially configured token has no expiration. The service
uses DynamicUser and LoadCredential; the token is never passed in arguments,
environment variables, Pages requests or logs.

`--check` is read-only: validates workflow access/state and metadata access,
without dispatch. It does not prove write permission. Installation does not
enable the timer. The morning timer checks at 04:07, 05:07 and 06:07
Europe/Prague; Persistent catches a missed activation after an outage.

Normal operation skips only if Pages was built today after 04:00 Prague time,
automatic-update provenance exists, and its raw snapshot covers today. It waits
for active production runs before a dispatch and rechecks freshness. A manual
dispatch racing the final check can still queue another build; existing Pages
concurrency serializes production deploys. POST is never retried after an
ambiguous network failure. On a later timer invocation the active-run check
prevents a blind duplicate. Monitoring is bounded to about 20 minutes plus HTTP
timeouts; errors retain the old production and allow the next hourly attempt.

The 2026-03-10 GitHub REST API returns the dispatched run ID. The scheduler
monitors this specific run and verifies newer deployed metadata, including with
`--force`, which is used for the initial end-to-end test despite today's fresh
production. Merely receiving a dispatch response or a successful build is not
treated as success.

After installation, while the morning timer is still disabled, run:

```bash
sudo systemd-run --unit=sotofoto-gtfs-test --wait --pipe \
  -p DynamicUser=yes -p PrivateTmp=yes -p TimeoutStartSec=30min \
  -p LoadCredential=github-token:/etc/sotofoto-gtfs/github-token \
  /usr/bin/python3 /opt/sotofoto-gtfs/scheduler.py --force
```

Check its final `OK` message, run URL and production metadata. Only then enable:

```bash
sudo systemctl enable --now sotofoto-gtfs.timer
systemctl list-timers --all --no-pager --full sotofoto-gtfs.timer
```

Remove GitHub's old schedule only after this verification; keep workflow_dispatch,
push and pull_request behavior. Disabling the whole workflow would break the VPS
dispatch. Logs: `sudo journalctl -u sotofoto-gtfs.service --since today --no-pager`.
Errors mark the unit failed and are logged. Proactive Telegram/email notification
is not configured; choose a destination separately before adding it.

Pause with `sudo systemctl disable --now sotofoto-gtfs.timer`. Restore GitHub
schedule before removing the VPS trigger if automatic updates must continue.
No reinstall/overwrite is attempted automatically.

Local validation: `python3 -m unittest discover -s ops -p 'test_*.py'` and
`bash -n ops/install_gtfs_scheduler.sh`. VPS network/authentication, the normal systemd credential sandbox and a real API
dispatch were verified in the user terminal on 2026-10-08. Scheduled morning
activation and failure notification delivery have not been verified.
