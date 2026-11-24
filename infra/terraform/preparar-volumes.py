#!/usr/bin/env python3
"""Preflight somente leitura para revisar a troca dos nos e o add-on."""
import json
from pathlib import Path
import subprocess


def read(*args):
    p = subprocess.run(args, text=True, capture_output=True)
    if p.returncode:
        raise SystemExit("Consulta falhou; ajuste nao preparado:\n" + p.stderr)
    return json.loads(p.stdout)


def main():
    if not Path("storage.tf").is_file():
        raise SystemExit("Entre na pasta da infraestrutura atualizada.")
    identity = read("aws", "sts", "get-caller-identity", "--output", "json", "--no-cli-pager")
    if identity["Account"] != "362749056012":
        raise SystemExit("Conta diferente da autorizada.")
    pods = read("kubectl", "get", "pods", "-A", "-o", "json")["items"]
    non_system = [p for p in pods if p["metadata"]["namespace"] not in
                  {"kube-system", "kube-public", "kube-node-lease"}]
    pvcs = read("kubectl", "get", "pvc", "-A", "-o", "json")["items"]
    if non_system or pvcs:
        raise SystemExit("Ha workloads ou PVCs fora da base inicial. Preserve-os e revise a migracao antes de continuar.")
    schema = read("aws", "eks", "describe-addon-configuration", "--region", "us-east-1",
                  "--addon-name", "aws-ebs-csi-driver", "--addon-version", "v1.68.1-eksbuild.1",
                  "--output", "json", "--no-cli-pager")
    schema = json.loads(schema["configurationSchema"])
    if "hostNetwork" not in schema.get("properties", {}).get("node", {}).get("properties", {}):
        raise SystemExit("Schema do add-on diferente do consultado. Nao gerar configuracao por palpite.")
    print("Preflight passou: sem apps/PVCs, schema do CSI confirmado, conta correta.")
    print("Nenhum arquivo ou recurso AWS foi alterado pelo helper.")
    print("O plano deve substituir somente o node group, atualizar o template e acrescentar o CSI.")


if __name__ == "__main__":
    main()
