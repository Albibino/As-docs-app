"""Prepara OIDC no Learner Lab e vincula as contas após o seed do app."""
import base64
import json
import os
import re
import secrets
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
REGION = 'us-east-1'
APP, IDENTITY = 'as-docs', 'as-docs-identity'
FINAL, STAGING = 'as-docs-backend-secret', 'as-docs-backend-bootstrap'
WEB = 'OIDC_CLIENT_SECRET_WEB'
APP_KEYS = ('APP_SECRET', 'DOCS_AI_HMAC_SECRET', 'DATABASE_URL')
EMAILS = ('usuario1@tcc.local', 'usuario2@tcc.local')
UUID = r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}'


class BootstrapError(RuntimeError):
    pass


def run(args, error, data=None, timeout=40):
    # Não propague stdout/stderr ou exceções do CLI: podem conter Secrets.
    try:
        result = subprocess.run(args, input=data, text=True, capture_output=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise BootstrapError(error) from exc
    if result.returncode:
        raise BootstrapError(error)
    return result.stdout.strip()


def kube_client(account, cluster, config):
    aws = ['aws', '--region', REGION, '--no-cli-pager']
    if run(aws + ['sts', 'get-caller-identity', '--query', 'Account', '--output', 'text'],
           'Não foi possível verificar a conta AWS.') != account:
        raise BootstrapError('Conta AWS diferente do state do laboratório.')
    run(aws + ['eks', 'update-kubeconfig', '--name', cluster, '--kubeconfig', config],
        'Não foi possível selecionar o cluster EKS do laboratório.')
    base = ['kubectl', '--kubeconfig', config, '--context', f'arn:aws:eks:{REGION}:{account}:cluster/{cluster}']

    def kub(ns, args, data=None, timeout=40, error=None):
        return run(base + [f'--request-timeout={timeout - 5}s', '-n', ns] + args,
                   error or f'Falha no Kubernetes: {args[0]} ({ns}).', data, timeout)

    return kub


def workload(kind, name, spec) -> dict[str, Any]:
    return dict(apiVersion='v1' if kind == 'Pod' else 'networking.k8s.io/v1', kind=kind,
                metadata={'name': name, 'namespace': IDENTITY}, spec=spec)


def keycloak(kub, mode, origin, image):
    kub(IDENTITY, ['rollout', 'status', 'deployment/as-docs-keycloak', '--timeout=6m'], timeout=380)
    name = 'as-docs-oidc-' + secrets.token_hex(8)
    labels = {'as-docs-oidc-bootstrap': name}
    policy = workload('NetworkPolicy', name, {
        'podSelector': {'matchLabels': {'app': 'as-docs-keycloak'}}, 'policyTypes': ['Ingress'],
        'ingress': [{'from': [{'podSelector': {'matchLabels': labels}}], 'ports': [{'protocol': 'TCP', 'port': 8443}]}],
    })
    volumes = [('keycloak-admin', 'as-docs-keycloak-bootstrap', ['username', 'password']),
               ('keycloak-tls', 'as-docs-keycloak-tls', ['tls.crt'])]
    pod = workload('Pod', name, {
        'automountServiceAccountToken': False, 'restartPolicy': 'Never', 'activeDeadlineSeconds': 220,
        'terminationGracePeriodSeconds': 2,
        'securityContext': {'runAsNonRoot': True, 'runAsUser': 1000, 'fsGroup': 1000,
                            'seccompProfile': {'type': 'RuntimeDefault'}},
        'volumes': [{'name': alias, 'secret': {'secretName': secret, 'defaultMode': 0o440,
                    'items': [{'key': key, 'path': key} for key in keys]}} for alias, secret, keys in volumes],
        'containers': [{'name': 'bootstrap', 'image': image, 'command': ['sleep', '220'],
                        'securityContext': {'allowPrivilegeEscalation': False, 'capabilities': {'drop': ['ALL']}},
                        'resources': {'requests': {'cpu': '20m', 'memory': '32Mi'}, 'limits': {'memory': '128Mi'}},
                        'volumeMounts': [{'name': alias, 'mountPath': '/run/' + alias, 'readOnly': True}
                                         for alias, _, _ in volumes]}],
    })
    pod['metadata']['labels'] = labels
    created = []
    try:
        for kind, manifest in (('networkpolicy', policy), ('pod', pod)):
            # Limpe também se a API receber a criação mas o cliente perder a resposta.
            created.append(f'{kind}/{name}')
            kub(IDENTITY, ['create', '-f', '-', '-o', 'name'], json.dumps(manifest))
        kub(IDENTITY, ['wait', '--for=condition=Ready', '--timeout=100s', f'pod/{name}'], timeout=115)
        result = json.loads(kub(IDENTITY, ['exec', '-i', f'pod/{name}', '-c', 'bootstrap', '--', 'node', '-', origin, mode],
                                (ROOT / 'lab-oidc-prepare.cjs').read_text(), timeout=80,
                                error='Falha ao validar o realm, o cliente web ou as contas de teste no Keycloak privado.'))
    finally:
        failed = False
        for obj in created:  # Fecha o acesso privado antes de remover o pod com credenciais montadas.
            try:
                kub(IDENTITY, ['delete', obj, '--ignore-not-found', '--wait=false'])
                try:
                    kub(IDENTITY, ['wait', '--for=delete', '--timeout=25s', obj])
                except BootstrapError:
                    if kub(IDENTITY, ['get', obj, '--ignore-not-found', '-o', 'name']):
                        raise
            except BootstrapError:
                failed = True
        if failed:
            raise BootstrapError(f'Não foi possível confirmar a remoção dos recursos OIDC efêmeros {name}.')
    return result


def secret_data(kub, name):
    encoded = kub(APP, ['get', 'secret', name, '--ignore-not-found', '-o', 'json'])
    return json.loads(encoded)['data'] if encoded else None


def verify_secret(fields, expected):
    try:
        for key in APP_KEYS:
            if not base64.b64decode(fields[key], validate=True):
                raise ValueError
        matches = secrets.compare_digest(base64.b64decode(fields[WEB], validate=True), expected)
    except (KeyError, ValueError, TypeError):
        matches = False
    if not matches:
        raise BootstrapError('Secret do backend incompleto ou divergente do Keycloak; nenhuma rotação foi feita.')


def prepare(kub, client_secret):
    encoded = secret_data(kub, FINAL)
    if encoded is None:
        staging = secret_data(kub, STAGING)
        if staging is None or any(not base64.b64decode(staging.get(key, ''), validate=True) for key in APP_KEYS):
            raise BootstrapError('Secret de bootstrap do banco ou da sessão incompleto.')
        payload = {key: staging[key] for key in APP_KEYS}
        payload[WEB] = base64.b64encode(client_secret).decode('ascii')
        kub(APP, ['create', '-f', '-', '-o', 'name'], json.dumps({
            'apiVersion': 'v1', 'kind': 'Secret', 'type': 'Opaque',
            'metadata': {'namespace': APP, 'name': FINAL}, 'data': payload,
        }))
        encoded = secret_data(kub, FINAL)
    verify_secret(encoded, client_secret)


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ('prepare', 'link'):
        raise BootstrapError('Uso: bash bootstrap-aws-lab-oidc.sh prepare|link')
    mode = sys.argv[1]
    account, cluster, origin, issuer, image = (os.environ.get(key, '') for key in (
        'EXPECTED_AWS_ACCOUNT_ID', 'EKS_CLUSTER', 'PUBLIC_APP_URL', 'OIDC_ISSUER', 'BACKEND_IMAGE'))
    if not (re.fullmatch(r'[0-9]{12}', account) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,99}', cluster)
            and re.fullmatch(r'http://as-docs-public-[0-9]+\.us-east-1\.elb\.amazonaws\.com', origin)
            and issuer == origin + '/id/realms/as-docs'
            and re.fullmatch(rf'{account}\.dkr\.ecr\.us-east-1\.amazonaws\.com/as-docs-backend@sha256:[a-f0-9]{{64}}', image)):
        raise BootstrapError('Conta, cluster, issuer ou imagem incompatível com o deploy integral do laboratório.')
    with tempfile.TemporaryDirectory() as tmp:
        kub = kube_client(account, cluster, str(Path(tmp) / 'kubeconfig'))
        result = keycloak(kub, mode, origin, image)
        client_secret = result['clientSecret'].encode('utf8')
        bindings = result['bindings']
        if (len(client_secret) < 32 or not client_secret.strip(b'*') or set(bindings) != set(EMAILS)
                or any(not re.fullmatch(UUID, bindings[email]) for email in EMAILS)
                or len(set(bindings.values())) != 2):
            raise BootstrapError('O Keycloak não retornou a configuração das duas contas esperadas.')
        if mode == 'prepare':
            prepare(kub, client_secret)
        else:
            verify_secret(secret_data(kub, FINAL), client_secret)
            kub(APP, ['rollout', 'status', 'deployment/as-docs-backend', '--timeout=8m'], timeout=500)
            # Dados não secretos, validados acima, seguem no stdin junto do código remoto.
            payload = json.dumps({'issuer': issuer, 'bindings': bindings})
            source = f'const labOidc = {payload};\n' + (ROOT / 'lab-oidc-link.cjs').read_text()
            kub(APP, ['exec', '-i', 'deployment/as-docs-backend', '-c', 'backend', '--', 'node', '-'], source,
                error='Vínculos OIDC não confirmados; confira issuer, TLS, migrações, seed e vínculos anteriores.')
    print('Secret do backend confirmado.' if mode == 'prepare' else 'Os dois vínculos OIDC do laboratório foram confirmados.')


if __name__ == '__main__':
    try:
        main()
    except BootstrapError as exc:
        raise SystemExit(str(exc)) from None
    except (AttributeError, KeyError, OSError, TypeError, ValueError):
        raise SystemExit('Resposta ou configuração inválida durante o bootstrap OIDC do laboratório.') from None
