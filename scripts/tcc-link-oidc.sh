#!/usr/bin/env bash
# Vincula os dois pares de IDs conferidos pelo operador. Não cria usuários.
set -euo pipefail

if [[ $# != 5 ]]; then
  printf 'Uso: bash %s ARQUIVO_ENV SUB_1 USER_ID_1 SUB_2 USER_ID_2\n' "$0" >&2
  exit 2
fi

env_file=$(realpath -e -- "$1")
shift
uuid='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
for id in "$@"; do
  if [[ ! $id =~ $uuid ]]; then
    printf 'Informe os quatro UUIDs conferidos no Keycloak e no Postgres do app.\n' >&2
    exit 2
  fi
done

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
docker compose -f "$root/docker-compose.yml" --env-file "$env_file" exec -T db \
  psql -X -U asdocs -d asdocs -v ON_ERROR_STOP=1 \
  -v sub1="$1" -v user1="$2" -v sub2="$3" -v user2="$4" <<'SQL'
SELECT to_regclass('public.oidc_accounts') IS NOT NULL AS migrated \gset
\if :migrated
\else
DO $$ BEGIN RAISE EXCEPTION 'Rode a migração do app antes de provisionar os vínculos OIDC.'; END $$;
\endif

BEGIN;
LOCK TABLE public.oidc_accounts IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE expected_links (
  issuer text NOT NULL DEFAULT 'http://localhost:9090/realms/as-docs',
  subject text PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE
) ON COMMIT DROP;
INSERT INTO expected_links (subject, user_id)
VALUES (:'sub1', :'user1'), (:'sub2', :'user2');

DO $$
BEGIN
  IF (SELECT count(*) FROM public.users u JOIN expected_links e ON e.user_id = u.id
      WHERE u.deleted_at IS NULL AND u.deactivated_at IS NULL) <> 2 THEN
    RAISE EXCEPTION 'Os dois UUIDs do app devem pertencer a usuários locais ativos.';
  END IF;
END $$;

INSERT INTO public.oidc_accounts (issuer, subject, user_id)
SELECT issuer, subject, user_id FROM expected_links
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.oidc_accounts a
      JOIN expected_links e USING (issuer, subject, user_id)) <> 2
     OR (SELECT count(*) FROM public.oidc_accounts
         WHERE issuer = (SELECT issuer FROM expected_links LIMIT 1)) <> 2 THEN
    RAISE EXCEPTION 'Vínculos OIDC divergentes; nenhuma alteração foi salva.';
  END IF;
END $$;

COMMIT;
SQL
printf 'Conferidos os dois vínculos OIDC do realm as-docs.\n'
