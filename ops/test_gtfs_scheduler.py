import unittest
from datetime import datetime, timezone
from unittest.mock import Mock
from gtfs_scheduler import current, update

NOW = datetime(2026, 10, 8, 8, 0, tzinfo=timezone.utc)


def metadata(built='2026-10-08T07:45:00+00:00'):
    return {'builtAt': built, 'automaticUpdate': {'verified': True},
            'sourceSnapshot': {'startDate': '20261008', 'endDate': '20261021'}}


def client(meta):
    c = Mock()
    c.meta.return_value = meta
    c.active.return_value = []
    c.api.side_effect = lambda path, body=None: (
        {'workflow_run_id': 123} if body else
        {'status': 'completed', 'conclusion': 'success'} if path == '/actions/runs/123' else
        {'state': 'active'})
    return c


class SchedulerTests(unittest.TestCase):
    def test_production_freshness(self):
        self.assertTrue(current(metadata(), NOW))
        for built in ('2026-10-07T07:00:00+00:00', '2026-10-08T01:00:00+00:00',
                      '2026-10-08T09:00:00+00:00', '2026-10-08T07:00:00', 'bad'):
            self.assertFalse(current(metadata(built), NOW))
        m = metadata(); m['sourceSnapshot']['startDate'] = '20261009'
        self.assertFalse(current(m, NOW))
        m = metadata(); m['automaticUpdate'] = None
        self.assertFalse(current(m, NOW))

    def test_winter_prague_threshold(self):
        now = datetime(2026, 12, 1, 5, tzinfo=timezone.utc)
        m = metadata('2026-12-01T03:00:00+00:00')
        m['sourceSnapshot'] = {'startDate': '20261201', 'endDate': '20261214'}
        self.assertTrue(current(m, now))
        m['builtAt'] = '2026-12-01T02:59:00+00:00'
        self.assertFalse(current(m, now))

    def test_fresh_day_does_not_dispatch(self):
        c = client(metadata())
        update(c, now=lambda: NOW)
        self.assertFalse(any(call.args[1:] for call in c.api.call_args_list))

    def test_check_never_dispatches_stale_data(self):
        c = client(metadata('2026-10-07T07:00:00+00:00'))
        update(c, check=True, now=lambda: NOW)
        c.active.assert_not_called()
        self.assertEqual(c.api.call_count, 1)

    def test_existing_run_finishes_without_duplicate(self):
        c = client(metadata())
        c.meta.side_effect = [metadata('2026-10-07T07:00:00+00:00'), metadata()]
        c.active.side_effect = [[{'id': 9}], []]
        update(c, now=lambda: NOW, sleep=lambda _: None)
        self.assertEqual(c.api.call_count, 1)

    def test_waits_for_deploy_metadata_after_success(self):
        old = metadata('2026-10-07T07:00:00+00:00')
        c = client(old)
        c.meta.side_effect = [old, old, metadata(), metadata('2026-10-08T08:00:01+00:00')]
        update(c, now=Mock(side_effect=[NOW, NOW, NOW,
               datetime(2026, 10, 8, 8, 0, 2, tzinfo=timezone.utc),
               datetime(2026, 10, 8, 8, 0, 2, tzinfo=timezone.utc)]),
               sleep=lambda _: None, timeout=100,
               clock=lambda: 0)
        # Metadata built before dispatch cannot be accepted even on today's date.

    def test_failed_workflow_is_not_success(self):
        c = client(metadata())
        c.api.side_effect = [{'state': 'active'}, {'workflow_run_id': 123},
                             {'status': 'completed', 'conclusion': 'failure'}]
        with self.assertRaisesRegex(RuntimeError, 'failure'):
            update(c, force=True, now=lambda: NOW)

    def test_lost_dispatch_response_is_not_retried(self):
        c = client(metadata())
        c.api.side_effect = [{'state': 'active'}, RuntimeError('Network request failed')]
        with self.assertRaisesRegex(RuntimeError, 'Network'):
            update(c, force=True, now=lambda: NOW)
        self.assertEqual(c.api.call_count, 2)

    def test_missing_dispatch_id_fails(self):
        c = client(metadata())
        c.api.side_effect = [{'state': 'active'}, {}]
        with self.assertRaisesRegex(RuntimeError, 'lacked run ID'):
            update(c, force=True, now=lambda: NOW)

    def test_active_run_timeout_does_not_dispatch(self):
        c = client(metadata('2026-10-07T07:00:00+00:00'))
        c.active.return_value = [{'id': 1}]
        with self.assertRaisesRegex(RuntimeError, 'no duplicate'):
            update(c, now=lambda: NOW, clock=Mock(side_effect=[0, 101]), timeout=100)
        self.assertEqual(c.api.call_count, 1)


if __name__ == '__main__':
    unittest.main()
