#!/usr/bin/env python3
"""Testes locais do bootstrap OIDC; aws e kubectl nunca são executados de verdade."""
import base64
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

DEPLOY = Path(__file__).resolve().parent
ACCOUNT = '123456789012'
ORIGIN = 'http://as-docs-public-123456.us-east-1.elb.amazonaws.com'
ISSUER = ORIGIN + '/id/realms/as-docs'
SECRET = 'fixture-web-secret-' + 'x' * 32
BINDINGS = {f'usuario{i}@tcc.local': f'00000000-0000-0000-0000-00000000000{i}' for i in (1, 2)}
DB_FIELDS = {'APP_SECRET': 'fixture-app-secret', 'DOCS_AI_HMAC_SECRET': 'fixture-hmac-secret',
             'DATABASE_URL': 'postgresql://asdocs_app:fixture@db/asdocs?sslmode=verify-full'}

MOCK = '''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path

cfg = json.loads(os.environ['FIXTURE'])
work = Path(os.environ['MOCK_WORK'])
args = sys.argv[1:]
with (work / 'calls').open('a') as log:
    log.write(json.dumps([Path(sys.argv[0]).name, *args]) + '\\n')
if Path(sys.argv[0]).name == 'aws':
    if 'sts' in args:
        print(cfg['account'])
    elif 'update-kubeconfig' in args:
        Path(args[args.index('--kubeconfig') + 1]).touch(mode=0o600)
    else:
        sys.exit(99)
    sys.exit(0)
assert args[args.index('--context') + 1] == 'arn:aws:eks:us-east-1:123456789012:cluster/as-docs-eks'
assert Path(args[args.index('--kubeconfig') + 1]).is_file()
ns = args[args.index('-n') + 1]
cmd = args[args.index('-n') + 2:]
if cmd[:2] == ['get', 'secret']:
    s = cmd[2]
    path = work / s
    if path.exists():
        print(path.read_text() if 'json' in cmd else 'secret/' + s)
    elif '--ignore-not-found' not in cmd:
        sys.exit(98)
elif cmd[0] == 'rollout' or cmd[0] in ('wait', 'delete'):
    pass
elif cmd[0] == 'create':
    obj = json.load(sys.stdin)
    assert obj['metadata']['namespace'] == ns
    path = work / obj['metadata']['name']
    if obj['kind'] == 'Secret':
        with path.open('x') as stream:
            json.dump(obj, stream)
    else:
        (work / obj['kind']).write_text(json.dumps(obj))
elif cmd[0] == 'exec':
    src = sys.stdin.read()
    if cmd[2] == 'deployment/as-docs-backend':
        assert ns == 'as-docs' and 'oidc_accounts' in src
        (work / 'link-source').write_text(src)
        print('linked')
    else:
        assert ns == 'as-docs-identity' and '/run/keycloak-admin/' in src
        if cfg.get('fail_keycloak'):
            print(cfg['secret'], file=sys.stderr)
            sys.exit(1)
        print(json.dumps({'clientSecret': cfg['secret'], 'bindings': cfg['bindings']}))
else:
    sys.exit(f'Unexpected: {cmd}')
'''


def data(fields):
    return {k: base64.b64encode(v.encode()).decode() for k, v in fields.items()}


class BootstrapTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.work = Path(tmp.name)
        mock = self.work / 'mock'
        mock.write_text(MOCK)
        mock.chmod(0o700)
        for name in ('aws', 'kubectl'):
            (self.work / name).symlink_to(mock)
        (self.work / 'as-docs-backend-bootstrap').write_text(json.dumps({'data': data(DB_FIELDS)}))
        self.final = self.work / 'as-docs-backend-secret'

    def invoke(self, action, *, account=ACCOUNT, issuer=ISSUER, **fixture):
        cfg = {'account': account, 'secret': SECRET, 'bindings': BINDINGS} | fixture
        env = {'PATH': str(self.work) + os.pathsep + os.defpath, 'HOME': str(self.work),
               'MOCK_WORK': str(self.work), 'FIXTURE': json.dumps(cfg),
               'EXPECTED_AWS_ACCOUNT_ID': ACCOUNT, 'EKS_CLUSTER': 'as-docs-eks',
               'PUBLIC_APP_URL': ORIGIN, 'OIDC_ISSUER': issuer,
               'BACKEND_IMAGE': f'{ACCOUNT}.dkr.ecr.us-east-1.amazonaws.com/as-docs-backend@sha256:' + 'a' * 64}
        result = subprocess.run(['bash', str(DEPLOY / 'bootstrap-aws-lab-oidc.sh'), action],
                                capture_output=True, text=True, env=env, timeout=30)
        for value in [cfg['secret'], *DB_FIELDS.values(), *data(DB_FIELDS).values()]:
            self.assertNotIn(value, result.stdout + result.stderr)
        return result

    def calls(self):
        return [json.loads(line) for line in (self.work / 'calls').read_text().splitlines()]

    def test_prepare_creates_backend_secret_once_and_cleans_up(self):
        for _ in range(2):
            result = self.invoke('prepare')
            self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(self.final.read_text())['data'], data(DB_FIELDS | {'OIDC_CLIENT_SECRET_WEB': SECRET}))
        pod = json.loads((self.work / 'Pod').read_text())
        policy = json.loads((self.work / 'NetworkPolicy').read_text())
        self.assertFalse(pod['spec']['automountServiceAccountToken'])
        self.assertEqual(policy['spec']['ingress'][0]['from'][0]['podSelector']['matchLabels'], pod['metadata']['labels'])
        self.assertEqual(policy['spec']['ingress'][0]['ports'], [{'protocol': 'TCP', 'port': 8443}])
        self.assertEqual(sum('delete' in a for a in self.calls()), 4)

    def test_prepare_rejects_drift_without_replacing_secret(self):
        original = json.dumps({'data': data(DB_FIELDS | {'OIDC_CLIENT_SECRET_WEB': 'different'})})
        self.final.write_text(original)
        self.assertNotEqual(self.invoke('prepare').returncode, 0)
        self.assertEqual(self.final.read_text(), original)

    def test_keycloak_failure_keeps_secret_unwritten_and_cleans_up(self):
        result = self.invoke('prepare', fail_keycloak=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.final.exists())
        self.assertEqual(sum('delete' in a for a in self.calls()), 2)

    def test_mismatched_account_never_reaches_eks(self):
        self.assertNotEqual(self.invoke('prepare', account='999999999999').returncode, 0)
        self.assertEqual(len(self.calls()), 1)
        self.assertIn('sts', self.calls()[0])

    def test_wrong_issuer_never_reaches_aws(self):
        self.assertNotEqual(self.invoke('link', issuer=ISSUER + '/').returncode, 0)
        self.assertFalse((self.work / 'calls').exists())

    def test_link_only_executes_against_ready_backend_with_current_subjects(self):
        self.final.write_text(json.dumps({'data': data(DB_FIELDS | {'OIDC_CLIENT_SECRET_WEB': SECRET})}))
        result = self.invoke('link')
        self.assertEqual(result.returncode, 0, result.stderr)
        source = (self.work / 'link-source').read_text()
        self.assertIn(ISSUER, source)
        for subject in BINDINGS.values():
            self.assertIn(subject, source)
        self.assertNotIn(SECRET, source)
        self.assertEqual(sum('rollout' in a and 'deployment/as-docs-backend' in a for a in self.calls()), 1)


if __name__ == '__main__':
    unittest.main()
