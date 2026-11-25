#!/usr/bin/env bash
# Interface do local-exec em infra/lab/full-deploy.tf.
set +x
set -euo pipefail
umask 077
exec python3 "$(dirname -- "${BASH_SOURCE[0]}")/lab-oidc-bootstrap.py" "$@"
