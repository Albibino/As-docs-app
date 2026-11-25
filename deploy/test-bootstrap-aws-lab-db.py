#!/usr/bin/env python3
"""Contrato offline: nenhum subprocesso AWS ou Kubernetes é executado."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('bootstrap', Path(__file__).with_name('bootstrap-aws-lab-db.py'))
assert spec is not None and spec.loader is not None
bootstrap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bootstrap)

ACCOUNT = '123456789012'
HOST = 'as-docs-postgres.test.us-east-1.rds.amazonaws.com'
ADMIN_PASSWORD = 'TestAdmin9' * 4
ENV = dict(EXPECTED_AWS_ACCOUNT_ID=ACCOUNT, EKS_CLUSTER='as-docs-eks', DB_HOST=HOST,
           DB_ADMIN_PASSWORD=ADMIN_PASSWORD)


class Lab:
    def __init__(self):
        self.secrets = {}
        self.roles = set()
        self.owner = ''
        self.calls = []
        self.sql = []
        self.account = ACCOUNT
        self.fail_create = False
        self.fail_probe = 0
        self.fail_wait = False
        self.fail_delete = False
        self.keep_job = False
        self.bad_ca = False
        self.bad_tls = False
        self.bad_app_acl = False
        self.bad_cert = False
        self.job = None

    def run(self, args, label, data=None, timeout=45):
        self.calls.append((args, data))
        if args[0] == 'aws':
            return self.account if 'sts' in args else ''
        if args[0] == 'curl':
            Path(args[args.index('-o') + 1]).write_text('fake CA bundle')
            return ''
        if args[0] == 'openssl':
            if self.bad_ca and 'crl2pkcs7' in args:
                raise bootstrap.BootstrapError('CA inválida')
            if args[1] == 'req':
                for opt in ('-out', '-keyout'):
                    Path(args[args.index(opt) + 1]).write_text('fake content')
            if 'subjectAltName' in args:
                return ('DNS:wrong.invalid' if self.bad_cert else
                        'DNS:as-docs-keycloak.as-docs-identity.svc.cluster.local, DNS:localhost')
            return 'fake public key'
        ns = args[args.index('-n') + 1]
        cmd = args[args.index('-n') + 2:]
        if cmd[:2] == ['get', 'namespace']:
            return 'namespace/' + ns
        if cmd[:2] == ['get', 'secret']:
            item = self.secrets.get((ns, cmd[2]))
            if item is None:
                return ''
            if cmd[-1] == 'name':
                return 'secret/' + cmd[2] if item else ''
            return json.dumps({'data': {key: bootstrap.b64(val.encode()) for key, val in item.items()}})
        if cmd[:2] == ['create', 'configmap']:
            return json.dumps({'kind': 'ConfigMap', 'metadata': {'name': cmd[2]}})
        if cmd[:3] == ['create', 'secret', 'tls']:
            self.secrets[ns, cmd[3]] = {'tls.crt': 'fake cert', 'tls.key': 'fake key'}
        if cmd[:3] == ['create', '-f', '-']:
            assert data is not None
            item = json.loads(data)
            name = item['metadata']['name']
            if item['kind'] == 'Secret':
                self.secrets[ns, name] = item['stringData']
            elif item['kind'] in ('Pod', 'Job'):
                self.job = item
                if self.fail_create:
                    raise subprocess.TimeoutExpired(args, timeout)
        if cmd[:2] == ['get', 'pods']:
            return 'pod/probe-mock'
        if cmd[:2] == ['get', 'job'] and self.job:
            return 'job/' + self.job['metadata']['name']
        if cmd[0] == 'delete':
            if not self.keep_job:
                self.job = None
            if self.fail_delete:
                raise bootstrap.BootstrapError('falha no delete')
        if cmd[0] == 'wait' and '--for=condition=Ready' in cmd and self.fail_wait:
            raise bootstrap.BootstrapError('falha no wait')
        if cmd[0] == 'exec':
            assert data is not None
            conn = dict(field.split('=', 1) for field in cmd[-1].split())
            pwd, query = data.split('\n', 1)
            self.sql.append((conn, query))
            user = conn['user']
            if user == 'asdocs_admin':
                assert pwd == ADMIN_PASSWORD
            if 'SELECT current_user;' in query:
                if self.fail_probe and user == 'asdocs_admin':
                    self.fail_probe -= 1
                    raise bootstrap.BootstrapError('falha PostgreSQL')
                return user
            if 'SELECT EXISTS(SELECT 1 FROM pg_roles' in query:
                return 't' if any(f"rolname='{r}'" in query for r in self.roles) else 'f'
            if 'CREATE ROLE' in query:
                self.roles.add(query.split('CREATE ROLE ')[1].split()[0])
            if 'SELECT count(*) FROM pg_roles' in query:
                return '1'
            if 'pg_get_userbyid(datdba)' in query:
                if "datname='asdocs'" in query:
                    return 'asdocs_admin'
                return self.owner
            if 'SELECT datallowconn' in query:
                return 'f'
            if 'CREATE DATABASE keycloak' in query:
                self.owner = 'keycloak' if 'OWNER keycloak' in query else 'asdocs_admin'
            if 'ALTER DATABASE keycloak OWNER TO keycloak' in query:
                self.owner = 'keycloak'
            if 'FROM pg_stat_ssl' in query:
                if 'has_schema_privilege' not in query:
                    return user + (':false' if self.bad_tls else ':true')
                return 'f' if self.bad_tls or (self.bad_app_acl and user == 'asdocs_app') else 't'
        return ''

    def bootstrap(self):
        with patch.dict(os.environ, ENV, clear=True), patch.object(bootstrap, 'run', self.run), \
                patch.object(bootstrap.os, 'umask'), patch('time.sleep'), patch('builtins.print'):
            bootstrap.main()

    def commands(self, command):
        return [(args, data) for args, data in self.calls if command in args]


class BootstrapTest(unittest.TestCase):
    def test_account_mismatch_does_not_touch_cluster(self):
        lab = Lab()
        lab.account = '000000000000'
        with self.assertRaises(bootstrap.BootstrapError):
            lab.bootstrap()
        self.assertEqual(len(lab.calls), 1)

    def test_retry_repairs_acl_without_rotating_secrets_or_recreating_database(self):
        lab = Lab()
        lab.bootstrap()
        original = lab.secrets.copy()
        for _, sql in lab.sql:
            if 'CREATE ROLE' in sql:
                self.assertIn('SCRAM-SHA-256$', sql)
        lab.calls.clear()
        lab.sql.clear()
        lab.bootstrap()
        self.assertEqual(lab.secrets, original)
        sql = '\n'.join(query for _, query in lab.sql)
        self.assertNotIn('CREATE ROLE', sql)
        self.assertNotIn('CREATE DATABASE', sql)
        self.assertIn('REVOKE CONNECT, TEMPORARY ON DATABASE keycloak FROM PUBLIC;', sql)
        self.assertIn('REVOKE CONNECT, TEMPORARY ON DATABASE asdocs FROM PUBLIC;', sql)
        self.assertIn('GRANT USAGE, CREATE ON SCHEMA public TO asdocs_app;', sql)
        for extension in ('unaccent', 'pg_trgm', 'pgcrypto'):
            self.assertIn(f'CREATE EXTENSION IF NOT EXISTS {extension} WITH SCHEMA public;', sql)
        for conn, _ in lab.sql:
            self.assertEqual(conn['sslmode'], 'verify-full')
            self.assertEqual(conn['sslrootcert'], '/run/rds/ca.pem')

    def test_new_database_stays_closed_until_ownership_and_acl_commit(self):
        lab = Lab()
        lab.bootstrap()
        sql = [query for _, query in lab.sql]
        self.assertIn('CREATE DATABASE keycloak ALLOW_CONNECTIONS false;', ''.join(sql))
        transaction = next(query for query in sql if 'ALTER DATABASE keycloak OWNER TO keycloak' in query)
        for fragment in ('BEGIN;', 'REVOKE CONNECT, TEMPORARY', 'ALLOW_CONNECTIONS true', 'GRANT keycloak',
                         'ALTER DATABASE keycloak OWNER TO keycloak;', 'REVOKE keycloak', 'COMMIT;'):
            self.assertIn(fragment, transaction)

    def test_job_is_removed_after_ambiguous_create(self):
        lab = Lab()
        lab.fail_create = True
        with self.assertRaises(subprocess.TimeoutExpired):
            lab.bootstrap()
        self.assertIsNone(lab.job)

    def test_delete_failure_is_accepted_only_when_job_is_absent(self):
        lab = Lab()
        lab.fail_delete = True
        lab.bootstrap()
        self.assertTrue(lab.commands('get'))
        self.assertIsNone(lab.job)

    def test_retries_read_only_rds_preflight(self):
        lab = Lab()
        lab.fail_probe = 2
        lab.bootstrap()
        self.assertEqual(lab.fail_probe, 0)
        self.assertIsNone(lab.job)

    def test_reports_cleanup_failure_if_job_remains(self):
        lab = Lab()
        lab.fail_delete = lab.keep_job = True
        with self.assertRaisesRegex(bootstrap.BootstrapError, 'remoção do Job'):
            lab.bootstrap()

    def test_invalid_rds_bundle_is_not_applied(self):
        lab = Lab()
        lab.bad_ca = True
        with self.assertRaises(bootstrap.BootstrapError):
            lab.bootstrap()
        self.assertFalse(lab.commands('as-docs-keycloak-rds-ca'))
        self.assertFalse(lab.commands('exec'))

    def test_refuses_existing_app_url_without_hostname_verification(self):
        lab = Lab()
        lab.bootstrap()
        credentials = lab.secrets['as-docs', 'as-docs-backend-bootstrap'].copy()
        credentials['DATABASE_URL'] = credentials['DATABASE_URL'].replace('verify-full', 'require')
        lab.secrets['as-docs', 'as-docs-backend-secret'] = credentials
        lab.calls.clear()
        with self.assertRaises(bootstrap.BootstrapError):
            lab.bootstrap()
        self.assertFalse(lab.commands('exec'))

    def test_fails_if_workload_has_wrong_schema_acl(self):
        lab = Lab()
        lab.bad_app_acl = True
        with self.assertRaises(bootstrap.BootstrapError):
            lab.bootstrap()
        self.assertIsNone(lab.job)

    def test_backend_migration_can_create_temporary_tables(self):
        lab = Lab()
        lab.bootstrap()
        self.assertTrue(any("GRANT CONNECT, TEMPORARY ON DATABASE asdocs TO asdocs_app;" in query
                            for _, query in lab.sql))
        self.assertTrue(any("has_database_privilege(current_user, current_database(), 'TEMPORARY')" in query
                            for conn, query in lab.sql if conn['user'] == 'asdocs_app'))

    def test_invalid_existing_certificate_is_not_replaced(self):
        lab = Lab()
        lab.bootstrap()
        lab.calls.clear()
        lab.bad_cert = True
        with self.assertRaises(bootstrap.BootstrapError):
            lab.bootstrap()
        self.assertFalse(lab.commands('req'))
        self.assertFalse(lab.commands('exec'))

    def test_job_and_identity_policy_exist_before_sql(self):
        lab = Lab()
        lab.bootstrap()
        items = [(args, json.loads(data)) for args, data in lab.calls
                 if args[0] == 'kubectl' and data and data.startswith('{')]
        manifests = {item['kind']: (args, item) for args, item in items}
        policy_args, policy = manifests['NetworkPolicy']
        self.assertEqual(policy['metadata']['namespace'], 'as-docs-identity')
        self.assertEqual(policy['spec']['policyTypes'], ['Egress'])
        self.assertEqual(policy['spec']['egress'][0]['to'][0]['ipBlock']['except'], ['169.254.169.254/32'])
        job_args, job = manifests['Job']
        pod = job['spec']['template']['spec']
        self.assertFalse(pod['automountServiceAccountToken'])
        self.assertFalse(pod['enableServiceLinks'])
        self.assertRegex(pod['containers'][0]['image'], r'@sha256:[a-f0-9]{64}$')
        self.assertEqual(job['spec']['backoffLimit'], 0)
        self.assertGreater(job['spec']['ttlSecondsAfterFinished'], 0)
        self.assertLess(next(i for i, (args, _) in enumerate(lab.calls) if args is policy_args),
                        next(i for i, (args, _) in enumerate(lab.calls) if args is job_args))
        for args, _ in lab.calls:
            self.assertNotIn(ADMIN_PASSWORD, ' '.join(args))

    def test_subprocess_error_does_not_echo_output_or_input(self):
        noisy = subprocess.CompletedProcess(['fixture'], 1, stdout=ADMIN_PASSWORD, stderr=ADMIN_PASSWORD)
        with patch.object(bootstrap.subprocess, 'run', return_value=noisy):
            with self.assertRaisesRegex(bootstrap.BootstrapError, '^safe label$'):
                bootstrap.run(['fixture'], 'safe label', ADMIN_PASSWORD)


if __name__ == '__main__':
    unittest.main()
