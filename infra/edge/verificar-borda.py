#!/usr/bin/env python3
"""Verifica AWS/SSM/WAF; --aplicacao exige targets e rotas reais saudaveis."""
import argparse
import json
from pathlib import Path
import subprocess
import urllib.error
import urllib.request


def read(*args):
    p = subprocess.run(args, text=True, capture_output=True)
    if p.returncode:
        raise RuntimeError(p.stderr.strip())
    return json.loads(p.stdout)


def aws(service, *args):
    return read('aws', service, *args, '--region', 'us-east-1', '--output', 'json', '--no-cli-pager')


def status(url, user_agent='AsDocsInfraCheck/1.0'):
    request = urllib.request.Request(url, headers={'User-Agent': user_agent})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status
    except urllib.error.HTTPError as exc:
        return exc.code


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--aplicacao', action='store_true')
    args = parser.parse_args()
    if not Path('waf.tf').is_file():
        raise RuntimeError('Entre na pasta da etapa 06.')
    if aws('sts', 'get-caller-identity')['Account'] != '362749056012':
        raise RuntimeError('Conta diferente da autorizada.')
    outputs = {key: item['value'] for key, item in read('terraform', 'output', '-json').items()}
    alb = aws('elbv2', 'describe-load-balancers', '--load-balancer-arns', outputs['public_alb']['arn'])['LoadBalancers'][0]
    nlb = aws('elbv2', 'describe-load-balancers', '--names', 'as-docs-internal')['LoadBalancers'][0]
    if alb['Scheme'] != 'internet-facing' or nlb['Scheme'] != 'internal' or any(
            lb['VpcId'] != 'vpc-0a79932ef5165619e' or lb['State']['Code'] != 'active' for lb in [alb, nlb]):
        raise RuntimeError('Scheme, VPC ou estado dos balanceadores diferente do esperado.')
    ids = [item['id'] for item in outputs['frontend_instances'].values()]
    instances = [i for r in aws('ec2', 'describe-instances', '--instance-ids', *ids)['Reservations'] for i in r['Instances']]
    if len(instances) != 2 or len({i['Placement']['AvailabilityZone'] for i in instances}) != 2 or any(
            i['State']['Name'] != 'running' or i['MetadataOptions']['HttpTokens'] != 'required' or
            i['MetadataOptions']['HttpPutResponseHopLimit'] != 1 for i in instances):
        raise RuntimeError('Verifique as duas EC2 em zonas diferentes e IMDSv2 hop limit 1.')
    volumes = [mapping['Ebs']['VolumeId'] for i in instances for mapping in i['BlockDeviceMappings'] if 'Ebs' in mapping]
    if not all(v['Encrypted'] for v in aws('ec2', 'describe-volumes', '--volume-ids', *volumes)['Volumes']):
        raise RuntimeError('Disco frontend sem criptografia.')
    online = aws('ssm', 'describe-instance-information', '--filters', 'Key=InstanceIds,Values=' + ','.join(ids))['InstanceInformationList']
    if len(online) != 2 or any(i['PingStatus'] != 'Online' for i in online):
        raise RuntimeError('Aguarde o bootstrap e os dois agentes SSM Online; investigue cloud-init se persistir.')
    attached = aws('wafv2', 'get-web-acl-for-resource', '--resource-arn', alb['LoadBalancerArn'])['WebACL']['ARN']
    if attached != outputs['integration']['waf_web_acl_arn']:
        raise RuntimeError('WAF esperado nao esta associado ao ALB.')
    url = 'http://' + alb['DNSName']
    if status(url + '/mcp') != 404:
        raise RuntimeError('A rota MCP nao foi bloqueada como esperado no ALB.')
    if status(url + '/healthz', user_agent='') != 403:
        raise RuntimeError('O teste da regra WAF sem User-Agent nao retornou 403; aguarde propagacao e confira os logs.')
    for key in ['frontend_target_group', 'backend_target_group']:
        targets = aws('elbv2', 'describe-target-health', '--target-group-arn', outputs['integration'][key])['TargetHealthDescriptions']
        states = [t['TargetHealth']['State'] for t in targets]
        print(key + ': ' + ', '.join(states))
        if args.aplicacao and (not states or any(s != 'healthy' for s in states)):
            raise RuntimeError('Targets reais ainda nao estao todos healthy; concluir deploy/Service com o Muci.')
    print('INFRA_VERIFICADA: EC2/SSM, discos, ALB publico, NLB interno, associacao WAF, MCP 404 e regra WAF 403.')
    if args.aplicacao:
        for path in ['/healthz', '/api/health/live']:
            if status(outputs['public_app_url'] + path) != 200:
                raise RuntimeError('Rota real ainda nao retornou 200: ' + path)
        print('ROTAS_REAIS_VERIFICADAS. Login/Keycloak, IA, uploads e colaboracao exigem testes funcionais do grupo.')
    else:
        print('Nao valida deploy da aplicacao. Apos publicar os containers e o Service, repetir com --aplicacao.')
    print('HTTPS configurado: ' + str(outputs['tls_enabled']))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, KeyError, ValueError, urllib.error.URLError) as exc:
        raise SystemExit('VERIFICACAO INTERROMPIDA: ' + str(exc))
