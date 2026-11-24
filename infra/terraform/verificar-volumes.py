#!/usr/bin/env python3
"""Teste real: gp3 temporario, dois Jobs, leitura persistente e IMDS em regime estavel."""
import json
import subprocess
import sys
import time
import uuid

NAMESPACE = "as-docs"
CLASS = "as-docs-gp3-check"
CLAIM = "as-docs-volume-check"
WRITER = "as-docs-volume-writer"
READER = "as-docs-volume-reader"
LABELS = {"infra-check": "as-docs-volumes"}

WRITE_CODE = '''import http.client, os, time
from pathlib import Path
with Path('/data/marcador').open('w') as f:
    f.write(os.environ['EXPECTED_MARKER'])
    f.flush()
    os.fsync(f.fileno())
print('ESCRITA_OK', flush=True)
# O VPC CNI standard programa a policy em paralelo ao inicio do pod.
# Este teste valida a restricao em regime estavel, nao a janela de inicializacao.
time.sleep(10)
c = http.client.HTTPConnection('169.254.169.254', 80, timeout=3)
try:
    c.request('PUT', '/latest/api/token', headers={'X-aws-ec2-metadata-token-ttl-seconds': '60'})
    response = c.getresponse()
except (OSError, TimeoutError, http.client.RemoteDisconnected):
    print('IMDS_BLOQUEADO_EM_REGIME_ESTAVEL', flush=True)
else:
    raise SystemExit('FALHA: IMDS alcancavel pelo workload, HTTP ' + str(response.status))
finally:
    c.close()
'''

READ_CODE = '''import os
from pathlib import Path
if Path('/data/marcador').read_text() != os.environ['EXPECTED_MARKER']:
    raise SystemExit('FALHA: conteudo diferente depois de recriar o workload')
print('PERSISTENCIA_OK_APOS_RECRIAR_WORKLOAD', flush=True)
'''


def command(*args, payload=None, capture=True):
    p = subprocess.run(args, input=json.dumps(payload) if payload is not None else None,
                       text=True, capture_output=capture)
    if p.returncode:
        raise RuntimeError('Comando falhou: ' + ' '.join(args) +
                           ('\n' + p.stderr if capture else ''))
    return p.stdout if capture else ''


def get(kind, name, namespaced=True):
    args = ['kubectl'] + (['-n', NAMESPACE] if namespaced else [])
    raw = command(*args, 'get', kind, name, '--ignore-not-found', '-o', 'json')
    return json.loads(raw) if raw.strip() else None


def create(obj):
    command('kubectl', 'create', '-f', '-', payload=obj, capture=False)


def job(name, code, marker):
    return {
        'apiVersion': 'batch/v1', 'kind': 'Job',
        'metadata': {'name': name, 'namespace': NAMESPACE, 'labels': LABELS},
        'spec': {'backoffLimit': 0, 'activeDeadlineSeconds': 240,
                 'template': {'metadata': {'labels': LABELS}, 'spec': {
                     'restartPolicy': 'Never',
                     'securityContext': {'runAsNonRoot': True, 'runAsUser': 1000,
                                         'runAsGroup': 1000, 'fsGroup': 1000,
                                         'seccompProfile': {'type': 'RuntimeDefault'}},
                     'containers': [{
                         'name': 'check', 'image': 'python:3.13-slim',
                         'command': ['python', '-c', code],
                         'env': [{'name': 'EXPECTED_MARKER', 'value': marker},
                                 {'name': 'PYTHONDONTWRITEBYTECODE', 'value': '1'},
                                 {'name': 'PYTHONUNBUFFERED', 'value': '1'}],
                         'securityContext': {'allowPrivilegeEscalation': False,
                                             'readOnlyRootFilesystem': True,
                                             'capabilities': {'drop': ['ALL']}},
                         'resources': {'requests': {'cpu': '50m', 'memory': '64Mi'},
                                       'limits': {'memory': '128Mi'}},
                         'volumeMounts': [{'name': 'data', 'mountPath': '/data'}],
                     }],
                     'volumes': [{'name': 'data', 'persistentVolumeClaim': {'claimName': CLAIM}}],
                 }}},
    }


def wait_job(name):
    deadline = time.monotonic() + 240
    while time.monotonic() < deadline:
        status = (get('job', name) or {}).get('status', {})
        if status.get('succeeded', 0):
            command('kubectl', '-n', NAMESPACE, 'logs', 'job/' + name, capture=False)
            return
        if status.get('failed', 0) or any(
                c['type'] == 'Failed' and c['status'] == 'True'
                for c in status.get('conditions', [])):
            command('kubectl', '-n', NAMESPACE, 'logs', 'job/' + name, capture=False)
            raise RuntimeError('Job falhou: ' + name)
        print('Aguardando ' + name + ' (provisionamento, montagem ou teste)...', flush=True)
        time.sleep(10)
    raise RuntimeError('Tempo esgotado no Job ' + name)


def delete_job(name):
    command('kubectl', '-n', NAMESPACE, 'delete', 'job', name,
            '--cascade=foreground', '--wait=true', '--timeout=90s', capture=False)


def main():
    account = json.loads(command('aws', 'sts', 'get-caller-identity', '--output', 'json', '--no-cli-pager'))
    if account['Account'] != '362749056012':
        raise RuntimeError('Conta AWS diferente da autorizada.')
    context = command('kubectl', 'config', 'current-context').strip()
    if context != 'arn:aws:eks:us-east-1:362749056012:cluster/as-docs-eks':
        raise RuntimeError('Use o contexto do cluster as-docs-eks antes do teste.')
    nodes = json.loads(command('kubectl', 'get', 'nodes', '-o', 'json'))['items']
    if len(nodes) != 3 or not all(any(c['type'] == 'Ready' and c['status'] == 'True'
                                    for c in n['status']['conditions']) for n in nodes):
        raise RuntimeError('Aguarde a transicao terminar: sao necessarios exatamente tres nos Ready.')
    if any(a['type'] == 'ExternalIP' for n in nodes for a in n['status']['addresses']):
        raise RuntimeError('Foi encontrado um no com IP externo.')
    for kind, name in [('deployment', 'ebs-csi-controller'), ('daemonset', 'ebs-csi-node')]:
        command('kubectl', '-n', 'kube-system', 'rollout', 'status', kind + '/' + name,
                '--timeout=180s', capture=False)
    original = get('storageclass', 'gp3', False)
    if not original or original.get('provisioner') != 'ebs.csi.aws.com' or \
            original.get('parameters', {}).get('type') != 'gp3' or \
            original.get('parameters', {}).get('encrypted') != 'true' or \
            original.get('volumeBindingMode') != 'WaitForFirstConsumer':
        raise RuntimeError('StorageClass gp3 ausente ou diferente da configuracao esperada.')
    if not get('networkpolicy', 'workload-egress-without-imds'):
        raise RuntimeError('Policy de protecao do namespace ausente.')
    for kind, name, ns in [('storageclass', CLASS, False), ('pvc', CLAIM, True),
                           ('job', WRITER, True), ('job', READER, True)]:
        if get(kind, name, ns):
            raise RuntimeError('Objeto de verificacao ja existe; preserve e confira: ' + name)
    # Classe temporaria copia os parametros reais; Delete permite limpar apenas
    # o volume de verificacao. A gp3 da aplicacao continua com Retain.
    test_class = {'apiVersion': 'storage.k8s.io/v1', 'kind': 'StorageClass',
                  'metadata': {'name': CLASS, 'labels': LABELS},
                  'provisioner': original['provisioner'], 'parameters': original['parameters'],
                  'volumeBindingMode': original['volumeBindingMode'], 'reclaimPolicy': 'Delete'}
    print('Criando somente objetos temporarios de verificacao e EBS de 1 GiB.', flush=True)
    create(test_class)
    create({'apiVersion': 'v1', 'kind': 'PersistentVolumeClaim',
            'metadata': {'name': CLAIM, 'namespace': NAMESPACE, 'labels': LABELS},
            'spec': {'accessModes': ['ReadWriteOnce'], 'storageClassName': CLASS,
                     'resources': {'requests': {'storage': '1Gi'}}}})
    marker = uuid.uuid4().hex
    create(job(WRITER, WRITE_CODE, marker))
    wait_job(WRITER)
    delete_job(WRITER)
    print('Writer removido. Criando outro workload para ler o mesmo volume.', flush=True)
    create(job(READER, READ_CODE, marker))
    wait_job(READER)
    volume = get('pvc', CLAIM)['spec']['volumeName']
    delete_job(READER)
    command('kubectl', '-n', NAMESPACE, 'delete', 'pvc', CLAIM, '--wait=true', '--timeout=90s', capture=False)
    deadline = time.monotonic() + 180
    while get('pv', volume, False):
        if time.monotonic() >= deadline:
            raise RuntimeError('O volume de teste ainda nao concluiu a exclusao: ' + volume)
        print('Aguardando limpeza do PV/volume de teste...', flush=True)
        time.sleep(5)
    command('kubectl', 'delete', 'storageclass', CLASS, capture=False)
    print('SUCESSO: escrita, leitura apos recriar workload e bloqueio IMDS em regime estavel.', flush=True)
    print('Objetos temporarios removidos. Confira terraform plan para encerrar.', flush=True)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, KeyError, ValueError) as exc:
        print('VERIFICACAO INTERROMPIDA: ' + str(exc), file=sys.stderr)
        print('Objetos de teste existentes foram preservados para diagnostico; nao repetir sem revisar.', file=sys.stderr)
        sys.exit(1)
