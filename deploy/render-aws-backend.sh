#!/usr/bin/env bash
# Renderização local: não consulta o cluster nem manipula Secrets.
set -euo pipefail

image=${BACKEND_IMAGE:-}
origin=${PUBLIC_APP_URL:-}
lab_http=${OIDC_AWS_LAB_HTTP:-false}
oauth=${DOCS_AI_OAUTH_ENABLED:-false}
if [[ $oauth != true && $oauth != false ]]; then
  printf 'DOCS_AI_OAUTH_ENABLED deve ser true ou false.\n' >&2; exit 1
fi
if [[ ! $image =~ ^([a-z0-9]+([.-][a-z0-9]+)*(:[0-9]+)?/)([a-z0-9]+([._-]+[a-z0-9]+)*/)*[a-z0-9]+([._-]+[a-z0-9]+)*@sha256:[a-f0-9]{64}$ ]]; then
  printf 'BACKEND_IMAGE deve ser registry/repositório@sha256:<digest>.\n' >&2
  exit 1
fi
if [[ $lab_http == true ]]; then
  if [[ ! $origin =~ ^http://as-docs-public-[0-9]+\.us-east-1\.elb\.amazonaws\.com$ ]]; then
    printf 'O modo HTTP aceita apenas o DNS padrão do ALB as-docs-public.\n' >&2
    exit 1
  fi
  backchannel=https://as-docs-keycloak.as-docs-identity.svc.cluster.local:8443
elif [[ $lab_http != false || ! $origin =~ ^https://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]([a-z0-9-]*[a-z0-9])?$ ]]; then
  printf 'PUBLIC_APP_URL deve ser https://<domínio>, sem caminho ou barra final.\n' >&2
  exit 1
else
  backchannel=
fi
trust=as-docs-aws-lab-trust
ai_url=http://as-docs-ai.as-docs.svc.cluster.local:8000
if [[ $oauth == true ]]; then
  backchannel=https://as-docs-keycloak.as-docs-identity.svc.cluster.local:8443
  trust=as-docs-ai-backend-trust
  ai_url=https://as-docs-ai.as-docs.svc.cluster.local:8443
fi

base=$(cd -- "$(dirname -- "$0")/k8s" && pwd)
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
cp "$base/20-backend-config.yaml" "$base/22-backend.yaml" "$work/"
cat > "$work/kustomization.yaml" <<EOF
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - 20-backend-config.yaml
  - 22-backend.yaml
images:
  - name: as-docs-backend
    newName: ${image%@*}
    digest: ${image##*@}
patches:
  - patch: |-
      apiVersion: v1
      kind: ConfigMap
      metadata:
        name: as-docs-backend-config
        namespace: as-docs
      data:
        APP_URL: "$origin"
        OIDC_ENABLED: "true"
        OIDC_AWS_LAB_HTTP: "$lab_http"
        OIDC_BACKCHANNEL_URL: "$backchannel"
        OIDC_ISSUER: "$origin/id/realms/as-docs"
        OIDC_CLIENT_ID: "docs-app-web"
        DOCS_AI_OAUTH_ENABLED: "$oauth"
        DOCS_AI_URL: "$ai_url"
EOF
if [[ $lab_http == true || $oauth == true ]]; then
  cat >> "$work/kustomization.yaml" <<EOF
  - patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: as-docs-backend
        namespace: as-docs
      spec:
        template:
          spec:
            containers:
              - name: backend
                env:
                  - name: NODE_EXTRA_CA_CERTS
                    value: /etc/as-docs/trust/ca.pem
                volumeMounts:
                  - name: aws-lab-trust
                    mountPath: /etc/as-docs/trust
                    readOnly: true
            volumes:
              - name: aws-lab-trust
                configMap:
                  name: $trust
EOF
fi
if [[ $oauth == true ]]; then
  cat >> "$work/kustomization.yaml" <<'EOF'
  - target:
      kind: Deployment
      name: as-docs-backend
    patch: |-
      - op: add
        path: /spec/template/spec/containers/0/envFrom/-
        value:
          secretRef:
            name: as-docs-backend-ai-oauth
EOF
fi
kubectl kustomize "$work"
