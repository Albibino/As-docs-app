#!/usr/bin/env bash
# Chamado com o contexto e kubeconfig já verificados pelo apply-aws-ai.sh.
set +x
set -euo pipefail
context=${1:?}
image=${2:?}
root=$(cd -- "$(dirname -- "$0")" && pwd)
k=(kubectl --context "$context" --request-timeout=25s)
app=("${k[@]}" -n as-docs)
ns=("${k[@]}" -n as-docs-identity)
secret=as-docs-backend-ai-oauth
if [[ -n $("${app[@]}" get secret "$secret" --ignore-not-found -o name) ]]; then
  exit 0
fi
if [[ -z $("${ns[@]}" get secret as-docs-keycloak-bootstrap --ignore-not-found -o name) ]]; then
  printf 'Sem bootstrap administrativo do Keycloak. Prepare o Secret as-docs/%s antes de ativar a IA.\n' "$secret" >&2
  exit 1
fi
[[ $image =~ ^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$ ]]
name="as-docs-ai-client-$(python3 -c 'import uuid; print(uuid.uuid4().hex[:12])')"
created=()
cleanup() {
  local failed=0 resource
  for resource in "${created[@]}"; do
    "${ns[@]}" delete "$resource/$name" --ignore-not-found --wait=false >/dev/null || failed=1
  done
  return "$failed"
}
trap 'cleanup' EXIT
# A janela privada aceita apenas o pod temporário identificado por este label.
python3 - "$name" <<'PY' | "${ns[@]}" create -f - >/dev/null
import json, sys
name = sys.argv[1]
print(json.dumps(dict(apiVersion='networking.k8s.io/v1', kind='NetworkPolicy', metadata={'name':name}, spec={
    'podSelector':{'matchLabels':{'app':'as-docs-keycloak'}}, 'policyTypes':['Ingress'],
    'ingress':[{'from':[{'podSelector':{'matchLabels':{'as-docs-ai-bootstrap':name}}}], 'ports':[{'protocol':'TCP','port':8443}]}]})))
PY
created+=(networkpolicy)
python3 - "$name" "$image" <<'PY' | "${ns[@]}" create -f - >/dev/null
import json, sys
name, image = sys.argv[1:]
volumes = [('keycloak-admin','as-docs-keycloak-bootstrap',['username','password']),('keycloak-tls','as-docs-keycloak-tls',['tls.crt'])]
print(json.dumps(dict(apiVersion='v1', kind='Pod', metadata={'name':name,'labels':{'as-docs-ai-bootstrap':name}}, spec={
    'automountServiceAccountToken':False,'restartPolicy':'Never','activeDeadlineSeconds':220,'terminationGracePeriodSeconds':2,
    'securityContext':{'runAsNonRoot':True,'runAsUser':1000,'seccompProfile':{'type':'RuntimeDefault'}},
    'volumes':[{'name':v,'secret':{'secretName':s,'items':[{'key':x,'path':x} for x in keys]}} for v,s,keys in volumes],
    'containers':[{'name':'bootstrap','image':image,'command':['sleep','220'],
      'securityContext':{'allowPrivilegeEscalation':False,'capabilities':{'drop':['ALL']}},
      'resources':{'requests':{'cpu':'20m','memory':'32Mi'},'limits':{'memory':'128Mi'}},
      'volumeMounts':[{'name':v,'mountPath':'/run/'+v,'readOnly':True} for v,_,_ in volumes]}]})))
PY
created+=(pod)
kubectl --context "$context" --request-timeout=100s -n as-docs-identity wait --for=condition=Ready --timeout=90s "pod/$name" >/dev/null
if ! "${ns[@]}" exec -i "$name" -- node - < "$root/keycloak-ai-clients.cjs" |
    "${app[@]}" create -f - -o name 2>/dev/null; then
  printf 'Não foi possível entregar o Secret técnico da IA. Nenhuma credencial foi rotacionada.\n' >&2
  exit 1
fi
"${app[@]}" get secret "$secret" -o name >/dev/null
cleanup
trap - EXIT
for resource in "${created[@]}"; do
  kubectl --context "$context" --request-timeout=40s -n as-docs-identity wait --for=delete --timeout=30s "$resource/$name" >/dev/null
  [[ -z $("${ns[@]}" get "$resource/$name" --ignore-not-found -o name) ]]
done
