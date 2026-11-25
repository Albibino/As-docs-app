#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export BACKEND_IMAGE="registry.example.com/project/backend@sha256:$(printf '%064d' 1)"
export PUBLIC_APP_URL=https://docs.example.com
manifest=$(bash deploy/render-aws-backend.sh)
grep -Fxq "        image: $BACKEND_IMAGE" <<< "$manifest"
grep -Fxq '  type: NodePort' <<< "$manifest"
grep -Fxq '    nodePort: 30300' <<< "$manifest"
! grep -Eq 'type: LoadBalancer|^kind: Secret$|:latest' <<< "$manifest" || exit 1
grep -Fxq '  OIDC_ENABLED: "true"' <<< "$manifest"
grep -Fxq '  OIDC_ISSUER: https://docs.example.com/id/realms/as-docs' <<< "$manifest"
if OIDC_AWS_LAB_HTTP=true PUBLIC_APP_URL=http://docs.example.com bash deploy/render-aws-backend.sh >/dev/null 2>&1; then
  printf 'Aceitou HTTP para o deploy público\n' >&2; exit 1
fi
if BACKEND_IMAGE=registry.example.com/project/backend:latest bash deploy/render-aws-backend.sh >/dev/null 2>&1; then
  printf 'Aceitou tag mutável para o deploy\n' >&2; exit 1
fi
lab_origin=http://as-docs-public-123456.us-east-1.elb.amazonaws.com
if PUBLIC_APP_URL="$lab_origin" bash deploy/render-aws-backend.sh >/dev/null 2>&1; then
  printf 'Aceitou HTTP sem opt-in\n' >&2; exit 1
fi
lab_manifest=$(PUBLIC_APP_URL="$lab_origin" OIDC_AWS_LAB_HTTP=true bash deploy/render-aws-backend.sh)
grep -Fxq '  OIDC_AWS_LAB_HTTP: "true"' <<< "$lab_manifest"
grep -Fxq '  OIDC_BACKCHANNEL_URL: https://as-docs-keycloak.as-docs-identity.svc.cluster.local:8443' <<< "$lab_manifest"
grep -Fxq '          name: as-docs-aws-lab-trust' <<< "$lab_manifest"
oauth=$(DOCS_AI_OAUTH_ENABLED=true bash deploy/render-aws-backend.sh)
oauth_lab=$(PUBLIC_APP_URL="$lab_origin" OIDC_AWS_LAB_HTTP=true DOCS_AI_OAUTH_ENABLED=true bash deploy/render-aws-backend.sh)
for rendered in "$oauth" "$oauth_lab"; do
  grep -Fxq '  DOCS_AI_OAUTH_ENABLED: "true"' <<< "$rendered"
  grep -Fxq '  DOCS_AI_URL: https://as-docs-ai.as-docs.svc.cluster.local:8443' <<< "$rendered"
  grep -Fxq '  OIDC_BACKCHANNEL_URL: https://as-docs-keycloak.as-docs-identity.svc.cluster.local:8443' <<< "$rendered"
  grep -Fq 'as-docs-ai-backend-trust' <<< "$rendered"
  grep -Fq 'as-docs-backend-ai-oauth' <<< "$rendered"
done
! DOCS_AI_OAUTH_ENABLED=typo bash deploy/render-aws-backend.sh >/dev/null 2>&1 || exit 1
printf 'Manifesto AWS: NodePort, digest e OIDC verificados\n'
