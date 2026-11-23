#!/usr/bin/env python3
"""Consultas de preflight; nao cria recursos nem modifica configuracoes."""
import json
from pathlib import Path
import subprocess


def read(*args):
    p = subprocess.run(args, text=True, capture_output=True)
    if p.returncode:
        raise SystemExit('Consulta falhou:\n' + p.stderr)
    return json.loads(p.stdout)


def aws(service, *args):
    return read('aws', service, *args, '--region', 'us-east-1', '--output', 'json', '--no-cli-pager')


def main():
    if not Path('backend-service.yaml').is_file() or not Path('waf.tf').is_file():
        raise SystemExit('Entre na pasta da etapa 06 antes de executar.')
    if aws('sts', 'get-caller-identity')['Account'] != '967931808920':
        raise SystemExit('Conta diferente da autorizada.')
    profile = aws('iam', 'get-instance-profile', '--instance-profile-name', 'LabInstanceProfile')['InstanceProfile']
    if [r['Arn'] for r in profile['Roles']] != ['arn:aws:iam::967931808920:role/LabRole']:
        raise SystemExit('Perfil diferente do confirmado; nao criar novas funcoes IAM.')
    cluster = aws('eks', 'describe-cluster', '--name', 'as-docs-eks')['cluster']
    if cluster['status'] != 'ACTIVE' or cluster['resourcesVpcConfig']['vpcId'] != 'vpc-04354398b0920234a':
        raise SystemExit('Cluster/rede nao correspondem a base verificada.')
    context = subprocess.check_output(['kubectl', 'config', 'current-context'], text=True).strip()
    if context != 'arn:aws:eks:us-east-1:967931808920:cluster/as-docs-eks':
        raise SystemExit('Contexto kubectl diferente da base.')
    nodes = read('kubectl', '--request-timeout=15s', 'get', 'nodes', '-o', 'json')['items']
    if len(nodes) != 3 or not all(any(c['type'] == 'Ready' and c['status'] == 'True'
                                    for c in n['status']['conditions']) for n in nodes):
        raise SystemExit('Sao necessarios tres nos Ready antes de integrar a borda.')
    services = read('kubectl', '--request-timeout=15s', 'get', 'services', '-A', '-o', 'json')['items']
    for svc in services:
        md = svc['metadata']
        expected = (md['namespace'], md['name']) == ('as-docs', 'as-docs-backend')
        if any(p.get('nodePort') == 30300 for p in svc['spec'].get('ports', [])) and not expected:
            raise SystemExit('NodePort 30300 ja utilizado por outro Service; preservar e revisar.')
        if expected and svc.get('status', {}).get('loadBalancer', {}).get('ingress'):
            raise SystemExit('O backend ja tem um balanceador Kubernetes. Revisar a migracao com o Muci antes de criar outro.')
    group = aws('wafv2', 'describe-managed-rule-group', '--scope', 'REGIONAL',
                '--vendor-name', 'AWS', '--name', 'AWSManagedRulesCommonRuleSet')
    required = {'SizeRestrictions_BODY', 'CrossSiteScripting_BODY', 'GenericLFI_BODY', 'GenericRFI_BODY'}
    if not required.issubset({r['Name'] for r in group['Rules']}):
        raise SystemExit('Regras WAF diferentes das documentadas; revisar overrides antes do plano.')
    print('Preflight passou: conta, perfil, VPC, tres nos Ready, NodePort e regras WAF conferidos.')
    print('Nenhum recurso ou arquivo foi alterado. Proximo passo: init, validate, testes e plan.')
    print('Sem dominio/certificado preenchidos, o pacote cria somente HTTP temporario.')


if __name__ == '__main__':
    main()
