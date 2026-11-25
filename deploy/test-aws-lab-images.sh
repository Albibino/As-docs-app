#!/usr/bin/env bash
# Regressão offline: usa índices Git locais e substitui AWS e Docker.
set -euo pipefail
cd -- "$(dirname -- "$0")"
python3 - <<'PY'
import json
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

publisher = Path('publish-aws-lab-images.sh').resolve()
account = '123456789012'
registry = f'{account}.dkr.ecr.us-east-1.amazonaws.com'
services = ('frontend', 'backend', 'ai')

mock = r'''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path

args = sys.argv[1:]
tool = Path(sys.argv[0]).name
state = Path(os.environ['STATE'])
test = os.environ['SCENARIO']
account = os.environ['EXPECTED_AWS_ACCOUNT_ID']
registry = os.environ['FRONTEND_REPO'].split('/')[0]
log = state / 'calls'

def option(name):
    return args[args.index(name) + 1]

def image_for(service):
    return os.environ[f'{service.upper()}_REPO'] + ':' + os.environ[f'{service.upper()}_TAG']

with log.open('a') as out:
    print(json.dumps([tool, *args]), file=out)
if tool == 'aws':
    assert option('--region') == 'us-east-1'
    if args[:2] == ['sts', 'get-caller-identity']:
        print('999999999999' if test == 'wrong_account' else account)
    elif args[:2] == ['ecr', 'describe-images']:
        assert option('--registry-id') == account
        service = option('--repository-name').removeprefix('as-docs-')
        assert option('--image-ids') == 'imageTag=' + image_for(service).split(':')[-1]
        if service == 'ai' and test == 'denied':
            sys.exit('AccessDeniedException')
        if service == 'ai' and test == 'bad_digest':
            print('None')
        elif (state / service).exists():
            print('sha256:' + 'a' * 64)
        else:
            sys.exit('An error occurred (ImageNotFoundException) when calling the DescribeImages operation')
    elif args[:2] == ['ecr', 'get-login-password']:
        print('token-ficticio-do-teste')
    else:
        raise AssertionError(args)
else:
    assert tool == 'docker'
    action = args[0]
    config = Path(os.environ['DOCKER_CONFIG'])
    assert config.is_dir() and config.stat().st_mode & 0o077 == 0
    if action == 'login':
        assert args[1:] == ['--username', 'AWS', '--password-stdin', registry]
        assert sys.stdin.read().strip() == 'token-ficticio-do-teste'
        assert json.loads((config / 'config.json').read_text()) == {'auths': {registry: {}}}
        (state / 'config_path').write_text(str(config))
    elif action == 'build':
        image = option('-t')
        service = next(s for s in ('frontend', 'backend', 'ai') if image == image_for(s))
        assert option('--platform') == 'linux/amd64'
        context = Path(args[-1])
        dockerfile = Path(option('-f'))
        assert dockerfile == context / ('Dockerfile' if service == 'ai' else f'{service}/Dockerfile')
        expected = json.loads(os.environ['EXPECTED_FILES'])[service != 'ai']
        actual = sorted(str(path.relative_to(context)) for path in context.rglob('*') if path.is_file())
        assert actual == sorted(expected), (service, sorted(set(expected) - set(actual)), sorted(set(actual) - set(expected)))
        assert (context / ('src/tcc_docs_ai/config.py' if service == 'ai' else 'package.json')).read_text() == 'working-tree\n'
    elif action == 'push':
        service = next(s for s in ('frontend', 'backend', 'ai') if args[1] == image_for(s))
        target = state / service
        assert not target.exists(), 'tentativa de sobrescrever tag imutável'
        if test == 'push_failed':
            sys.exit('falha de push simulada')
        target.touch()
        if test == 'race':
            sys.exit('tag imutável já publicada por outro processo')
    else:
        raise AssertionError(args)
'''

with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    app, ai, bin_dir = (tmp / name for name in ('As-docs-app', 'As-docs-ai', 'bin'))
    for directory in (app, ai, bin_dir, tmp / 'home'):
        directory.mkdir()
    for tool in ('aws', 'docker'):
        cmd = bin_dir / tool
        cmd.write_text(mock)
        cmd.chmod(0o700)
    env = dict(PATH=f'{bin_dir}:{os.environ["PATH"]}', HOME=str(tmp / 'home'),
               TMPDIR=str(tmp), EXPECTED_AWS_ACCOUNT_ID=account, TCC_DOCS_AI_PATH=str(ai),
               GIT_CONFIG_NOSYSTEM='1')
    for service in services:
        env[f'{service.upper()}_TAG'] = 'lab-' + '1' * 24
        env[f'{service.upper()}_REPO'] = f'{registry}/as-docs-{service}'

    def write(repo, name, value='fixture\n'):
        path = repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value)

    def git(repo, *args):
        subprocess.run(['git', '-C', str(repo), *args], check=True, env=env)

    app_files = ['.dockerignore', 'frontend/Dockerfile', 'backend/Dockerfile',
                 'frontend/nginx/default.conf.template', 'frontend/nginx/security-headers.conf',
                 'apps/client/package.json', 'apps/server/package.json', 'packages/editor-ext/package.json',
                 'apps/server/src/integrations/export/pdf/assets/logo.svg',
                 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'nx.json']
    ai_files = ['.dockerignore', 'Dockerfile', 'pyproject.toml', 'uv.lock', 'README.md', 'src/tcc_docs_ai/config.py']
    unpublished = 'src/tcc_docs_ai/oidc_config.py'
    env['EXPECTED_FILES'] = json.dumps([ai_files + [unpublished], app_files])
    for repo, files in ((app, app_files), (ai, ai_files)):
        git(repo, 'init', '-q')
        write(repo, '.gitignore', '.env*\nignored-*\n')
        for name in files + ['deploy/sample.txt', 'infra/lab/key.tfvars', '.env.example']:
            write(repo, name)
        git(repo, 'add', '-A')
        git(repo, 'add', '-f', '.env.example')
        write(repo, '.env', 'NAO_COPIAR_SEGREDO_FICTICIO\n')
        write(repo, 'untracked-outside.txt')
    write(app, 'package.json', 'working-tree\n')
    write(ai, 'src/tcc_docs_ai/config.py', 'working-tree\n')
    write(ai, unpublished)
    (app / 'apps/client/private.key').write_text('NAO_COPIAR_SEGREDO_FICTICIO\n')
    (ai / 'src/ignored-local.py').write_text('NAO_COPIAR_SEGREDO_FICTICIO\n')
    git(app, 'add', 'apps/client/private.key')
    script = app / 'deploy' / publisher.name
    shutil.copyfile(publisher, script)

    def fingerprint_inputs(kind, root):
        proc = subprocess.run(['bash', str(script), '--build-inputs', kind, str(root)],
                              check=True, capture_output=True, text=True, env=env)
        return json.loads(proc.stdout)

    baseline = fingerprint_inputs('app', app)
    assert set(baseline) == set(app_files)
    write(app, '.npmrc', 'NAO_COPIAR_SEGREDO_FICTICIO\n')
    git(app, 'add', '-f', '.npmrc')
    write(app, 'apps/client/ignored-build-fixture.txt')
    assert fingerprint_inputs('app', app) == baseline
    write(app, 'apps/client/package.json', 'alteração de build\n')
    changed = fingerprint_inputs('app', app)
    assert {name for name in baseline if baseline[name] != changed[name]} == {'apps/client/package.json'}
    ai_inputs = fingerprint_inputs('ai', ai)
    assert set(ai_inputs) == set(ai_files + [unpublished])
    assert json.loads(subprocess.check_output(['bash', str(script), '--build-manifest', 'app', str(app)], env=env)) == sorted(changed)

    def fingerprint(inputs):
        entries = ''.join(f'{hashlib.sha256(name.encode()).hexdigest()}:{inputs[name]}\n' for name in sorted(inputs))
        return hashlib.sha256(entries.encode()).hexdigest()

    env.update(APP_BUILD_FINGERPRINT=fingerprint(changed), AI_BUILD_FINGERPRINT=fingerprint(ai_inputs))

    def run(scenario, state, success=True, **overrides):
        state.mkdir(exist_ok=True)
        (state / 'calls').unlink(missing_ok=True)
        proc = subprocess.run(['bash', str(script)], cwd=tmp, capture_output=True, text=True,
                              env=dict(env, STATE=str(state), SCENARIO=scenario) | overrides)
        output = proc.stdout + proc.stderr
        assert (proc.returncode == 0) == success, (scenario, output)
        assert 'token-ficticio-do-teste' not in output and 'NAO_COPIAR_SEGREDO_FICTICIO' not in output, output
        config_path = state / 'config_path'
        if config_path.exists():
            assert not Path(config_path.read_text()).exists(), 'credenciais Docker não foram removidas'
        log = state / 'calls'
        return [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []

    def docker_actions(calls):
        return [call[1] for call in calls if call[0] == 'docker']

    state = tmp / 'first'
    assert docker_actions(run('first', state)) == ['login', 'build', 'push', 'build', 'push', 'build', 'push']
    calls = run('repeat', state)
    assert not docker_actions(calls) and not any('get-login-password' in call for call in calls)
    (state / 'backend').unlink()
    assert docker_actions(run('partial', state)) == ['login', 'build', 'push']
    assert docker_actions(run('race', tmp / 'race')) == ['login', 'build', 'push', 'build', 'push', 'build', 'push']
    assert docker_actions(run('push_failed', tmp / 'push_failed', False)) == ['login', 'build', 'push']
    for case in ('wrong_account', 'denied', 'bad_digest'):
        calls = run(case, tmp / case, False)
        assert not docker_actions(calls) and not any('get-login-password' in call for call in calls)
    assert not run('invalid_tag', tmp / 'invalid_tag', False, AI_TAG='latest')
    assert not run('stale_plan', state, False, APP_BUILD_FINGERPRINT='0' * 64)

    unknown = 'src/tcc_docs_ai/new_module.py'
    write(ai, unknown)
    assert not docker_actions(run('unexpected_untracked', tmp / 'unexpected_untracked', False))
    (ai / unknown).unlink()
    (ai / unpublished).unlink()
    assert not docker_actions(run('missing_required', tmp / 'missing_required', False))
    (ai / unpublished).symlink_to(ai / '.env')
    assert not docker_actions(run('unsafe_symlink', tmp / 'unsafe_symlink', False))
    print('Publicador AWS Lab: testes offline passaram.')
PY