"""VPS trigger for the existing Pages workflow; Python standard library only."""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ZONE = ZoneInfo('Europe/Prague')
SITE = 'https://anlexcz.github.io/sotofoto/data/meta.json'
API = 'https://api.github.com/repos/anlexcz/sotofoto'
WORKFLOW = '/actions/workflows/pages.yml'


def current(meta, now, minimum=None):
    try:
        built = datetime.fromisoformat(meta['builtAt'])
        if built.tzinfo is None:
            return False
        local = built.astimezone(ZONE)
        today = now.astimezone(ZONE)
        day = today.strftime('%Y%m%d')
        source = meta['sourceSnapshot']
        return bool(local.date() == today.date() and local.hour >= 4
                    and built <= now and meta.get('automaticUpdate')
                    and source['startDate'] <= day <= source['endDate']
                    and (minimum is None or built >= minimum))
    except (KeyError, ValueError, TypeError):
        return False


class Client:
    def __init__(self, token):
        self.token = token

    def request(self, url, body=None, authenticated=False):
        headers = {'User-Agent': 'sotofoto-vps-scheduler', 'Cache-Control': 'no-cache'}
        if authenticated:
            if not url.startswith(API + '/'):
                raise RuntimeError('Unexpected authenticated destination')
            headers.update({'Accept': 'application/vnd.github+json',
                            'Authorization': 'Bearer ' + self.token,
                            'X-GitHub-Api-Version': '2026-03-10'})
        if body is not None:
            headers['Content-Type'] = 'application/json'
        req = urllib.request.Request(url, headers=headers,
                                     data=None if body is None else json.dumps(body).encode())
        # Never retry POST: a lost response may still have created a run.
        for attempt in range(3 if body is None else 1):
            try:
                with urllib.request.urlopen(req, timeout=30) as response:
                    payload = response.read()
                    return json.loads(payload) if payload else {}
            except urllib.error.HTTPError as error:
                if body is not None or error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                    raise RuntimeError(f'HTTP {error.code} from {url.split("?")[0]}') from None
            except (urllib.error.URLError, TimeoutError):
                if body is not None or attempt == 2:
                    raise RuntimeError(f'Network request failed: {url.split("?")[0]}') from None
            time.sleep((5, 20)[attempt])

    def api(self, path, body=None):
        return self.request(API + path, body, True)

    def meta(self):
        # Cache-busting metadata only; token is never sent to Pages.
        return self.request(SITE + '?scheduler=' + str(time.time_ns()))

    def active(self):
        runs = []
        # Inspect every non-completed status, including blocked/waiting runs.
        for status in ('queued', 'in_progress', 'waiting', 'requested', 'pending'):
            result = self.api(WORKFLOW + '/runs?branch=main&per_page=1&status=' + status)
            runs.extend(r for r in result['workflow_runs']
                        if r['event'] != 'pull_request' and r['status'] != 'completed')
        return runs


def update(client, force=False, check=False, now=lambda: datetime.now(timezone.utc),
           sleep=time.sleep, clock=time.monotonic, timeout=1200):
    if client.api(WORKFLOW)['state'] != 'active':
        raise RuntimeError('Pages workflow is not active')
    meta = client.meta()
    fresh = current(meta, now())
    print('Production builtAt=' + str(meta.get('builtAt')) + '; current=' + str(fresh), flush=True)
    if check:
        print('Read-only check passed; no workflow dispatched.', flush=True)
        return
    if fresh and not force:
        print('Today already updated; skipped.', flush=True)
        return
    deadline = clock() + timeout
    while client.active():
        if clock() >= deadline:
            raise RuntimeError('Another production run is still active; no duplicate dispatched')
        print('Waiting for existing production run.', flush=True)
        sleep(20)
    if not force and current(client.meta(), now()):
        print('Existing run updated production; skipped.', flush=True)
        return
    started = now()
    result = client.api(WORKFLOW + '/dispatches', {'ref': 'main'})
    run_id = result.get('workflow_run_id')
    if not isinstance(run_id, int):
        raise RuntimeError('Dispatch response lacked run ID; inspect Actions before retrying')
    print(f'Dispatched https://github.com/anlexcz/sotofoto/actions/runs/{run_id}', flush=True)
    while True:
        run = client.api(f'/actions/runs/{run_id}')
        if run['status'] == 'completed':
            if run['conclusion'] != 'success':
                raise RuntimeError(f'Workflow {run_id}: {run["conclusion"]}')
            break
        if clock() >= deadline:
            raise RuntimeError(f'Workflow {run_id} not finished within monitoring limit')
        sleep(20)
    while not current(client.meta(), now(), minimum=started):
        if clock() >= deadline:
            raise RuntimeError(f'Workflow {run_id} succeeded but new production metadata not verified')
        sleep(20)
    print(f'OK: workflow {run_id} successful and new production metadata verified.', flush=True)


def main():
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--check', action='store_true')
    group.add_argument('--force', action='store_true')
    args = parser.parse_args()
    credentials = os.environ.get('CREDENTIALS_DIRECTORY')
    token_path = Path(credentials) / 'github-token' if credentials else Path('/etc/sotofoto-gtfs/github-token')
    try:
        token = token_path.read_text().strip()
        if not token or '\n' in token or '\r' in token:
            raise RuntimeError('Missing or malformed GitHub token')
        update(Client(token), force=args.force, check=args.check)
    except Exception as error:
        # No request headers or credentials are included in logs.
        print(f'ERROR: {error}', file=sys.stderr, flush=True)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
