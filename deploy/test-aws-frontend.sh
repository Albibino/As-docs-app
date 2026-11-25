#!/usr/bin/env bash
# Regressão offline: nenhum comando AWS ou Docker real é executado.
set -euo pipefail
cd -- "$(dirname -- "$0")"
python3 - <<'PY'
import json
import os
from pathlib import Path
import subprocess
import tempfile

account = '123456789012'
ids = ['i-00000000000000001', 'i-00000000000000002']
region = 'us-east-1'
registry = f'{account}.dkr.ecr.{region}.amazonaws.com'
image = f'{registry}/as-docs/frontend@sha256:' + 'a' * 64
arn = f'arn:aws:elasticloadbalancing:{region}:{account}:targetgroup/as-docs-frontend/0123456789abcdef'

with tempfile.TemporaryDirectory() as path:
    work = Path(path)
    log = work / 'calls'
    mock = work / 'aws'
    mock.write_text(r'''#!/usr/bin/env python3
import json, os, subprocess, sys
from pathlib import Path

tool = Path(sys.argv[0]).name
args = sys.argv[1:]
scenario = os.environ['SCENARIO']
ids = json.loads(os.environ['FRONTEND_INSTANCE_IDS'])
log = Path(os.environ['MOCK_LOG'])
cmdfile = log.with_name('commands')
mock_token = 'credencial-ficticia-do-teste'
previous = log.read_text().splitlines() if log.exists() else []
previous = [json.loads(line) for line in previous]

def record(*entry):
    with log.open('a') as handle:
        print(json.dumps(entry), file=handle)

def option(flag):
    return args[args.index(flag) + 1]

if tool == 'sleep':
    sys.exit(0)
if tool == 'curl':
    assert args[-1] in ['http://127.0.0.1/healthz', 'http://127.0.0.1/api/health/live']
    assert '-L' not in args and '--location' not in args
    record(tool, args[-1])
    print('302' if scenario == 'bad_proxy' and args[-1].endswith('/live') else '200', end='')
    sys.exit(0)
if tool == 'docker':
    record(tool, *args)
    action = args[0]
    if action == 'login':
        assert args == ['login', '--username', 'AWS', '--password-stdin',
                        os.environ['FRONTEND_IMAGE'].split('/')[0]]
        assert sys.stdin.read().strip() == mock_token
        assert Path(os.environ['DOCKER_CONFIG']).is_dir()
    elif action == 'pull':
        assert args[1:] == [os.environ['FRONTEND_IMAGE']]
    elif action == 'ps':
        if scenario == 'bad_proxy' and option('--filter') == 'name=^/as-docs-frontend$':
            print('anterior')
    elif action == 'create':
        assert option('--publish') == '80:8080'
        assert option('--restart') == 'unless-stopped'
        assert args[-1] == os.environ['FRONTEND_IMAGE']
        for chave in ('BACKEND_URL', 'PUBLIC_APP_URL'):
            assert f'{chave}={os.environ[chave]}' in args
        print('novo')
    else:
        assert action in ('rename', 'stop', 'start', 'rm'), args
    sys.exit(0)

assert tool == 'aws' and option('--region') == 'us-east-1'
service, action = args[:2]
if (service, action) == ('ecr', 'get-login-password'):
    record('ecr', action)
    if scenario == 'ecr_denied':
        sys.exit('Acesso ECR negado (simulado)')
    print(mock_token)
elif (service, action) == ('sts', 'get-caller-identity'):
    record(service, action)
    print('999999999999' if scenario == 'wrong_account' else os.environ['EXPECTED_AWS_ACCOUNT_ID'])
elif (service, action) == ('ssm', 'describe-instance-information'):
    record(service, action)
    assert option('--filters') == 'Key=InstanceIds,Values=' + ','.join(ids)
    print(json.dumps({'InstanceInformationList': [
        {'InstanceId': i, 'PlatformType': 'Linux',
         'PingStatus': 'ConnectionLost' if scenario == 'offline' and i == ids[1] else 'Online'}
        for i in ids]}))
elif (service, action) == ('elbv2', 'describe-target-health'):
    assert option('--target-group-arn') == os.environ['FRONTEND_TARGET_GROUP_ARN']
    states = {i: 'unhealthy' for i in ids}
    if scenario == 'one_healthy':
        states[ids[0]] = 'healthy'
    for i in ids:
        if (scenario != 'alb_failure'
                and ['ssm', 'get-command-invocation', i, 'Success'] in previous):
            states[i] = 'healthy' if ['alb', i, 'initial'] in previous else 'initial'
    if scenario == 'wrong_target':
        del states[ids[1]]
    for i, status in states.items():
        record('alb', i, status)
    print(json.dumps({'TargetHealthDescriptions': [
        {'Target': {'Id': i, 'Port': 80}, 'TargetHealth': {'State': status}}
        for i, status in reversed(list(states.items()))]}))
elif (service, action) == ('ssm', 'send-command'):
    assert args[2:4] == ['--instance-ids', option('--instance-ids')]
    i = option('--instance-ids')
    assert i in ids and option('--document-name') == 'AWS-RunShellScript'
    assert mock_token not in option('--parameters')
    payload = json.loads(option('--parameters'))
    assert len(payload['commands']) == 1
    record(service, action, i)
    # Exercita o script remoto entregue ao documento SSM (shell POSIX externa).
    result = subprocess.run(['sh', '-c', payload['commands'][0]], text=True, capture_output=True)
    status = 'Success' if result.returncode == 0 else 'Failed'
    assert mock_token not in result.stdout + result.stderr
    if status == 'Failed' and scenario not in ('bad_proxy', 'ecr_denied'):
        sys.exit(result.stderr)
    with cmdfile.open('a') as handle:
        print(i, status, file=handle)
    print('00000000-0000-0000-0000-' + i[-12:])
elif (service, action) == ('ssm', 'get-command-invocation'):
    i = option('--instance-id')
    assert option('--command-id').endswith(i[-12:])
    if [service, action, i, 'Pending'] not in previous:
        record(service, action, i, 'Pending')
        sys.exit('An error occurred (InvocationDoesNotExist)')
    status = dict(line.split() for line in cmdfile.read_text().splitlines())[i]
    record(service, action, i, status)
    print(status)
else:
    sys.exit('Chamada inesperada: ' + repr(args))
''')
    mock.chmod(0o700)
    for nome in ('docker', 'curl', 'sleep'):
        (work / nome).symlink_to(mock)
    env = dict(PATH=f'{work}:{os.defpath}', HOME=str(work), TMPDIR=str(work),
               MOCK_LOG=str(log), EXPECTED_AWS_ACCOUNT_ID=account,
               FRONTEND_INSTANCE_IDS=json.dumps(ids), FRONTEND_IMAGE=image,
               FRONTEND_TARGET_GROUP_ARN=arn, BACKEND_URL='http://internal-as-docs.example.com:3000',
               PUBLIC_APP_URL='https://docs.example.com')

    def run(scenario, expected=(), error=None, **changes):
        log.unlink(missing_ok=True)
        log.with_name('commands').unlink(missing_ok=True)
        result = subprocess.run(['bash', './apply-aws-frontend.sh'],
                                env={**env, 'SCENARIO': scenario, **changes},
                                text=True, capture_output=True, timeout=30)
        assert (result.returncode == 0) == (error is None), (scenario, result)
        if error:
            assert error in result.stderr, (scenario, result.stderr)
        calls = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
        sends = [call[2] for call in calls if call[:2] == ['ssm', 'send-command']]
        assert sends == list(expected), (scenario, sends)
        return calls

    for var, invalid in (
        ('EXPECTED_AWS_ACCOUNT_ID', '123'),
        ('FRONTEND_INSTANCE_IDS', json.dumps([ids[0], ids[0]])),
        ('FRONTEND_INSTANCE_IDS', json.dumps([ids[0], '$(false)'])),
        ('FRONTEND_INSTANCE_IDS', 'não é JSON'),
        ('FRONTEND_IMAGE', image.replace(account, '999999999999')),
        ('FRONTEND_IMAGE', image.split('@')[0] + ':latest'),
        ('FRONTEND_TARGET_GROUP_ARN', ''),
        ('FRONTEND_TARGET_GROUP_ARN', arn.replace(region, 'us-west-2')),
        ('BACKEND_URL', 'http://usuario:senha@backend.example.com:3000'),
        ('PUBLIC_APP_URL', 'https://docs.example.com/;$(false)'),
        ('PUBLIC_APP_URL', 'http://docs.example.com'),
    ):
        assert run('invalid', error=var, **{var: invalid}) == []
    assert run('wrong_account', error='conta esperada') == [['sts', 'get-caller-identity']]
    run('offline', error='online no SSM')
    run('wrong_target', error='exatamente as duas instâncias')

    for scenario, order, overrides in (
        ('bootstrap', ids, {'PUBLIC_APP_URL': 'http://as-docs-public-123.us-east-1.elb.amazonaws.com'}),
        ('one_healthy', ids[::-1], {}),
    ):
        calls = run(scenario, order, **overrides)
        first = calls.index(['ssm', 'send-command', order[0]])
        second = calls.index(['ssm', 'send-command', order[1]])
        step = calls[first + 1:second]
        assert step.index(['curl', 'http://127.0.0.1/healthz']) < step.index(['curl', 'http://127.0.0.1/api/health/live'])
        assert step.index(['curl', 'http://127.0.0.1/api/health/live']) < step.index(['ssm', 'get-command-invocation', order[0], 'Success'])
        assert step.index(['alb', order[0], 'initial']) < step.index(['alb', order[0], 'healthy'])

    calls = run('bad_proxy', ids[:1], error='SSM falhou')
    assert ['docker', 'rm', '-f', 'novo'] in calls
    assert ['docker', 'rename', 'anterior', 'as-docs-frontend'] in calls
    assert ['docker', 'start', 'anterior'] in calls
    calls = run('ecr_denied', ids[:1], error='SSM falhou')
    assert [call[1] for call in calls if call[0] == 'docker'] == ['login']
    run('alb_failure', ids[:1], error='O ALB não confirmou')
    print('OK: validação, conta, SSM, ECR, rollout, falha do ALB e restauração local simulados')
PY
