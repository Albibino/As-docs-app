#!/usr/bin/env python3
"""Bootstrap idempotente do banco e dos Secrets em um Learner Lab novo."""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import string
import subprocess
import tempfile
import time
from urllib.parse import urlsplit


class BootstrapError(RuntimeError):
    pass


def run(args, label, data=None, timeout=45):
    result = subprocess.run(args, input=data, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise BootstrapError(label)
    return result.stdout.strip()


def password():
    return ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(48))


def b64(value):
    return base64.b64encode(value).decode('ascii')


def verifier(value, salt=None):
    salt = secrets.token_bytes(16) if salt is None else salt
    salted = hashlib.pbkdf2_hmac('sha256', value.encode(), salt, 4096)
    client = hashlib.sha256(hmac.digest(salted, b'Client Key', 'sha256')).digest()
    server = hmac.digest(salted, b'Server Key', 'sha256')
    return f'SCRAM-SHA-256$4096:{b64(salt)}${b64(client)}:{b64(server)}'


def retry_read(read, expected, label, attempts=5):
    for attempt in range(attempts):
        try:
            value = read()
            if expected(value):
                return value
        except (BootstrapError, subprocess.TimeoutExpired):
            pass
        if attempt + 1 < attempts:
            time.sleep(3)
    raise BootstrapError(label)


def prepare_database(sql, admin, kc_password, app_password):
    def as_admin(db, text):
        return sql('asdocs_admin', db, admin, text)

    retry_read(lambda: as_admin('postgres', 'SELECT current_user;'),
               lambda result: result == 'asdocs_admin', 'Login TLS administrativo não confirmado.')
    for user, pwd in [('keycloak', kc_password), ('asdocs_app', app_password)]:
        exists = as_admin('postgres', f"SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='{user}');")
        if exists == 'f':
            as_admin('postgres', f"CREATE ROLE {user} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '{verifier(pwd)}';")
        elif exists != 't':
            raise BootstrapError('Não foi possível confirmar a role do aplicativo.')
        checks = as_admin('postgres', f"""
            SELECT count(*) FROM pg_roles WHERE rolname='{user}' AND rolcanlogin
              AND NOT (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls)
              AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid);
        """)
        if checks != '1':
            raise BootstrapError('Role de workload não tem as restrições esperadas.')
        # Valida a credencial antes de alterar os bancos, inclusive após uma tentativa parcial.
        if sql(user, 'postgres', pwd, 'SELECT current_user;') != user:
            raise BootstrapError('A role existente diverge da credencial registrada.')

    if as_admin('postgres', "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='asdocs';") != 'asdocs_admin':
        raise BootstrapError('O banco do app não pertence ao administrador esperado.')

    owner = as_admin('postgres', "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='keycloak';")
    if not owner:
        # CREATE DATABASE não pode participar da transação de ACLs. Se houver interrupção,
        # um banco ainda fechado, do administrador, pode ser retomado na próxima execução.
        as_admin('postgres', 'CREATE DATABASE keycloak ALLOW_CONNECTIONS false;')
        owner = 'asdocs_admin'
    if owner == 'asdocs_admin':
        if as_admin('postgres', "SELECT datallowconn FROM pg_database WHERE datname='keycloak';") != 'f':
            raise BootstrapError('O banco existente do Keycloak tem dono divergente.')
        as_admin('postgres', """
            BEGIN;
            REVOKE CONNECT, TEMPORARY ON DATABASE keycloak FROM PUBLIC;
            ALTER DATABASE keycloak ALLOW_CONNECTIONS true;
            GRANT keycloak TO asdocs_admin WITH SET TRUE GRANTED BY CURRENT_USER;
            ALTER DATABASE keycloak OWNER TO keycloak;
            REVOKE keycloak FROM asdocs_admin GRANTED BY CURRENT_USER;
            COMMIT;
        """)
    elif owner != 'keycloak':
        raise BootstrapError('O banco existente do Keycloak tem dono divergente.')
    sql('keycloak', 'keycloak', kc_password, """
        BEGIN;
        REVOKE CONNECT, TEMPORARY ON DATABASE keycloak FROM PUBLIC;
        REVOKE CREATE ON SCHEMA public FROM PUBLIC;
        COMMIT;
    """)
    as_admin('asdocs', """
        BEGIN;
        REVOKE CONNECT, TEMPORARY ON DATABASE asdocs FROM PUBLIC;
        REVOKE CREATE ON SCHEMA public FROM PUBLIC, asdocs_app;
        CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
        CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
        CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
        GRANT CONNECT, TEMPORARY ON DATABASE asdocs TO asdocs_app;
        GRANT USAGE, CREATE ON SCHEMA public TO asdocs_app;
        COMMIT;
    """)
    for user, database, pwd, other in [('keycloak', 'keycloak', kc_password, 'asdocs'),
                                       ('asdocs_app', 'asdocs', app_password, 'keycloak')]:
        extra = """
            AND NOT has_database_privilege(current_user, current_database(), 'CREATE')
            AND has_database_privilege(current_user, current_database(), 'TEMPORARY')
            AND (SELECT count(*) = 3 FROM pg_extension
                 WHERE extnamespace = 'public'::regnamespace
                   AND extname IN ('unaccent', 'pg_trgm', 'pgcrypto'))
        """ if user == 'asdocs_app' else ''
        check = sql(user, database, pwd, f"""
            SELECT current_user = '{user}' AND ssl
              AND has_schema_privilege(current_user, 'public', 'USAGE')
              AND has_schema_privilege(current_user, 'public', 'CREATE')
              AND NOT has_database_privilege(current_user, '{other}', 'CONNECT')
              {extra}
            FROM pg_stat_ssl WHERE pid=pg_backend_pid();
        """)
        if check != 't':
            raise BootstrapError(f'Login TLS, schema ou ACL de {database} não confirmado.')


def main():
    os.umask(0o077)
    account, cluster, host = (os.environ[name] for name in ('EXPECTED_AWS_ACCOUNT_ID', 'EKS_CLUSTER', 'DB_HOST'))
    admin = os.environ.pop('DB_ADMIN_PASSWORD')
    if not (re.fullmatch(r'[0-9]{12}', account) and re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', cluster)
            and re.fullmatch(r'as-docs-postgres\.[a-z0-9.-]+\.us-east-1\.rds\.amazonaws\.com', host)
            and re.fullmatch(r'[A-Za-z0-9]{32,128}', admin)):
        raise BootstrapError('Parâmetros de bootstrap do banco inválidos.')
    aws = ['aws', '--region', 'us-east-1', '--no-cli-pager']
    if run(aws + ['sts', 'get-caller-identity', '--query', 'Account', '--output', 'text'], 'Sessão AWS indisponível') != account:
        raise BootstrapError('Conta AWS não corresponde ao laboratório.')
    with tempfile.TemporaryDirectory() as work:
        config = str(Path(work) / 'kubeconfig')
        run(aws + ['eks', 'update-kubeconfig', '--name', cluster, '--kubeconfig', config], 'EKS indisponível')
        k = ['kubectl', '--kubeconfig', config, '--context', f'arn:aws:eks:us-east-1:{account}:cluster/{cluster}']
        identity, app = 'as-docs-identity', 'as-docs'

        def kub(ns, args, data=None, timeout=45):
            return run(k + ['--request-timeout=' + str(timeout - 5) + 's', '-n', ns] + args,
                       f'Falha no Kubernetes: {args[0]} ({ns})', data, timeout)

        for ns in (identity, app):
            if not kub(ns, ['get', 'namespace', ns, '--ignore-not-found', '-o', 'name']):
                try:
                    kub(ns, ['create', 'namespace', ns])
                except BootstrapError:
                    kub(ns, ['get', 'namespace', ns, '-o', 'name'])
        storage = Path(__file__).resolve().parent.parent / 'infra/terraform/storage-gp3.yaml'
        kub(app, ['apply', '--server-side', '-f', str(storage)])
        # A política de ingress do Keycloak é gerenciada pela borda. A proteção
        # de egress também deve existir na identidade antes de qualquer pod.
        kub(identity, ['apply', '--server-side', '-f', '-'], json.dumps({
            'apiVersion': 'networking.k8s.io/v1', 'kind': 'NetworkPolicy',
            'metadata': {'name': 'workload-egress-without-imds', 'namespace': identity},
            'spec': {'podSelector': {}, 'policyTypes': ['Egress'],
                     'egress': [{'to': [{'ipBlock': {'cidr': '0.0.0.0/0', 'except': ['169.254.169.254/32']}}]}]},
        }))

        def read_secret(ns, name):
            raw = kub(ns, ['get', 'secret', name, '--ignore-not-found', '-o', 'json'])
            if not raw:
                return None
            encoded = json.loads(raw)['data']
            return {key: base64.b64decode(value, validate=True).decode() for key, value in encoded.items()}

        def ensure_secret(ns, name, maker):
            found = read_secret(ns, name)
            if found is None:
                kub(ns, ['create', '-f', '-', '-o', 'name'], json.dumps({
                    'apiVersion': 'v1', 'kind': 'Secret', 'type': 'Opaque',
                    'metadata': {'name': name, 'namespace': ns}, 'stringData': maker(),
                }))
                found = read_secret(ns, name)
                if found is None:
                    raise BootstrapError('Secret criado não foi encontrado.')
            return found

        tls = 'as-docs-keycloak-tls'
        svc = 'as-docs-keycloak.as-docs-identity.svc.cluster.local'
        cert, key = Path(work) / 'tls.crt', Path(work) / 'tls.key'
        existing = read_secret(identity, tls)
        if existing is None:
            run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '365',
                 '-subj', f'/CN={svc}', '-addext', f'subjectAltName=DNS:{svc},DNS:localhost',
                 '-addext', 'extendedKeyUsage=serverAuth', '-keyout', str(key), '-out', str(cert)], 'Emissão TLS privada falhou')
        else:
            cert.write_text(existing['tls.crt'])
            key.write_text(existing['tls.key'])
        names = run(['openssl', 'x509', '-in', str(cert), '-noout', '-checkend', '0', '-ext', 'subjectAltName'],
                    'Certificado TLS privado inválido')
        if not {f'DNS:{svc}', 'DNS:localhost'}.issubset(re.split(r'[,\s]+', names)):
            raise BootstrapError('Certificado TLS privado não cobre os nomes esperados.')
        run(['openssl', 'verify', '-CAfile', str(cert), '-purpose', 'sslserver', str(cert)], 'Certificado TLS privado não confiável')
        cert_pub = run(['openssl', 'x509', '-in', str(cert), '-pubkey', '-noout'], 'Chave do certificado inválida')
        key_pub = run(['openssl', 'pkey', '-in', str(key), '-passin', 'pass:', '-pubout'], 'Chave TLS privada inválida')
        if cert_pub != key_pub:
            raise BootstrapError('Chave não corresponde ao certificado TLS privado.')
        if existing is None:
            kub(identity, ['create', 'secret', 'tls', tls, f'--cert={cert}', f'--key={key}'])
        kc_admin = ensure_secret(identity, 'as-docs-keycloak-bootstrap', lambda: {'username': 'lab-bootstrap', 'password': password()})
        if not kc_admin['username'] or not kc_admin['password']:
            raise BootstrapError('O Secret administrativo do Keycloak está incompleto.')
        ca = str(Path(work) / 'ca.pem')
        run(['curl', '--disable', '--proto', '=https', '--fail', '--silent', '--show-error', '--max-time', '30', '-o', ca,
             'https://truststore.pki.rds.amazonaws.com/us-east-1/us-east-1-bundle.pem'], 'Download da CA do RDS falhou')
        run(['openssl', 'x509', '-in', ca, '-noout'], 'Bundle vazio ou inválido da CA do RDS')
        run(['openssl', 'crl2pkcs7', '-nocrl', '-certfile', ca, '-out', '/dev/null'], 'Bundle inválido da CA do RDS')
        configmap = 'as-docs-keycloak-rds-ca'
        manifest = kub(identity, ['create', 'configmap', configmap, f'--from-file=ca.pem={ca}', '--dry-run=client', '-o', 'json'])
        kub(identity, ['apply', '--server-side', '--field-manager=as-docs-infra-keycloak', '-f', '-'], manifest)

        def create_app():
            return {'APP_SECRET': password(), 'DOCS_AI_HMAC_SECRET': password(),
                    'DATABASE_URL': f'postgresql://asdocs_app:{password()}@{host}:5432/asdocs?sslmode=verify-full'}

        app_secret = read_secret(app, 'as-docs-backend-secret')
        if app_secret is None:
            app_secret = ensure_secret(app, 'as-docs-backend-bootstrap', create_app)
        app_url = urlsplit(app_secret['DATABASE_URL'])
        if ((app_url.scheme, app_url.hostname, app_url.port, app_url.username, app_url.path, app_url.query, app_url.fragment)
                != ('postgresql', host, 5432, 'asdocs_app', '/asdocs', 'sslmode=verify-full', '')
                or not app_secret['APP_SECRET']):
            raise BootstrapError('A credencial existente do app não corresponde ao banco esperado.')
        kc_password = ensure_secret(identity, 'as-docs-keycloak-db', lambda: {'password': password()})['password']
        app_password = app_url.password
        if any(not value or not re.fullmatch(r'[A-Za-z0-9]{32,128}', value) for value in (kc_password, app_password)):
            raise BootstrapError('Credencial existente não pode ser adotada pelo bootstrap.')
        ctx = 'as-docs-rds-init-' + secrets.token_hex(5)
        pod = {'spec': {
            'automountServiceAccountToken': False, 'enableServiceLinks': False, 'restartPolicy': 'Never',
            'terminationGracePeriodSeconds': 1, 'securityContext': {'runAsNonRoot': True, 'runAsUser': 999,
              'seccompProfile': {'type': 'RuntimeDefault'}},
            'volumes': [{'name': 'rds-ca', 'configMap': {'name': configmap}}],
            'containers': [{'name': 'pg', 'command': ['sleep', '600'],
                'image': 'docker.io/library/postgres:18@sha256:c699303802144847d238196173655dbbecf7a96aeca1565f2b02eb671a1f0b6b',
                'securityContext': {'allowPrivilegeEscalation': False, 'capabilities': {'drop': ['ALL']}},
                'resources': {'requests': {'cpu': '20m', 'memory': '32Mi'}, 'limits': {'memory': '128Mi'}},
                'volumeMounts': [{'name': 'rds-ca', 'mountPath': '/run/rds', 'readOnly': True}]}],
        }}
        job = dict(apiVersion='batch/v1', kind='Job', metadata={'name': ctx, 'namespace': identity}, spec={
            'activeDeadlineSeconds': 600, 'backoffLimit': 0, 'ttlSecondsAfterFinished': 60, 'template': pod,
        })
        probe_error = False
        try:
            kub(identity, ['create', '-f', '-', '-o', 'name'], json.dumps(job))
            pod_name = retry_read(lambda: kub(identity, ['get', 'pods', '-l', f'batch.kubernetes.io/job-name={ctx}', '-o', 'name']),
                                  lambda value: re.fullmatch(r'pod/[a-z0-9.-]+', value), 'Pod de bootstrap não encontrado.')
            kub(identity, ['wait', '--for=condition=Ready', '--timeout=115s', pod_name], timeout=130)

            def sql(user, db, pwd, query):
                conn = f'host={host} dbname={db} user={user} sslmode=verify-full sslrootcert=/run/rds/ca.pem'
                return kub(identity, ['exec', '-i', pod_name, '--', 'sh', '-c',
                           'IFS= read -r PGPASSWORD || exit 2; export PGPASSWORD; PGCONNECT_TIMEOUT=8 exec psql -X -w -qAt -v ON_ERROR_STOP=1 "$1"',
                           'sh', conn], pwd + '\n' + query + '\n')

            prepare_database(sql, admin, kc_password, app_password)
        except BaseException:
            probe_error = True
            raise
        finally:
            try:
                kub(identity, ['delete', 'job', ctx, '--ignore-not-found', '--cascade=foreground', '--wait=true', '--timeout=25s'])
            except (BootstrapError, OSError, subprocess.TimeoutExpired):
                try:
                    if kub(identity, ['get', 'job', ctx, '--ignore-not-found', '-o', 'name']):
                        raise BootstrapError('A remoção do Job de bootstrap não foi confirmada.')
                except (BootstrapError, OSError, subprocess.TimeoutExpired):
                    if not probe_error:
                        raise BootstrapError('A remoção do Job de bootstrap não foi confirmada.') from None
                    print('Aviso: remoção do Job não confirmada; há limite de execução e TTL.')
    print('Banco, namespaces, TLS privado e Secrets de bootstrap confirmados.')


if __name__ == '__main__':
    try:
        main()
    except BootstrapError as exc:
        raise SystemExit(f'Bootstrap do banco falhou: {exc}') from None
    except (KeyError, TypeError, ValueError, OSError, subprocess.TimeoutExpired):
        # Provisionador efêmero: nenhum comando SQL, credencial ou manifesto vai ao console.
        raise SystemExit('Bootstrap do banco falhou; confira configuração, conectividade e permissões do laboratório.') from None
