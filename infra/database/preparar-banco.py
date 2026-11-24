#!/usr/bin/env python3
"""Consultas AWS somente leitura; escreve apenas variaveis locais ignoradas."""
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys

ACCOUNT = "362749056012"
REGION = "us-east-1"
IDENTIFIER = "as-docs-postgres"
PREFERRED = (
    "db.t3.micro", "db.t4g.micro", "db.t3.small", "db.t4g.small",
    "db.t3.medium", "db.t4g.medium",
)


def aws(*args):
    proc = subprocess.run(
        ["aws", *args, "--region", REGION, "--output", "json", "--no-cli-pager"],
        capture_output=True, text=True, env={**os.environ, "AWS_PAGER": ""},
    )
    if proc.returncode:
        # As consultas nao incluem credenciais, senhas nem tokens nos argumentos.
        raise SystemExit("Consulta AWS falhou; nenhum recurso foi criado.\n" + proc.stderr)
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        raise SystemExit("Resposta AWS invalida; nenhuma configuracao foi gerada.")


def select_option(versions):
    versions = sorted(
        (v for v in versions if re.fullmatch(r"18\.\d+(?:\.\d+)?", v)),
        key=lambda v: tuple(int(n) for n in v.split(".")), reverse=True,
    )
    for version in versions:
        options = aws(
            "rds", "describe-orderable-db-instance-options", "--engine", "postgres",
            "--engine-version", version, "--vpc",
        )["OrderableDBInstanceOptions"]
        for instance_class in PREFERRED:
            for option in options:
                zones = {z["Name"] for z in option.get("AvailabilityZones", [])}
                if (
                    option.get("DBInstanceClass") == instance_class
                    and option.get("StorageType") == "gp2"
                    and option.get("MultiAZCapable") is True
                    and option.get("SupportsStorageEncryption") is True
                    and option.get("SupportsStorageAutoscaling") is True
                    and option.get("MinStorageSize", 1000) <= 20
                    and option.get("MaxStorageSize", 0) >= 100
                    and {"us-east-1a", "us-east-1b"}.issubset(zones)
                ):
                    return version, instance_class
    raise SystemExit(
        "Nao foi encontrada uma combinacao PostgreSQL 18/gp2/Multi-AZ nas classes "
        "permitidas. Cole esta mensagem para ajustar; nenhum recurso foi criado."
    )


def main():
    if not Path("main.tf").is_file() or not Path("versions.tf").is_file():
        raise SystemExit("Entre na pasta as-docs-terraform-etapa-04-banco antes de executar.")
    if aws("sts", "get-caller-identity").get("Account") != ACCOUNT:
        raise SystemExit("Conta diferente da autorizada. Nenhum arquivo foi alterado.")
    path = Path("database-secrets.auto.tfvars.json")
    settings = Path("database-settings.auto.tfvars.json")
    if path.is_symlink() or settings.is_symlink():
        raise SystemExit("Arquivo de variaveis nao pode ser um link simbolico.")
    if path.exists():
        try:
            secret = json.loads(path.read_text())["db_password"]
            if not isinstance(secret, str) or not re.fullmatch(r"[A-Za-z0-9]{32,128}", secret):
                raise ValueError
        except (OSError, KeyError, ValueError, TypeError):
            raise SystemExit("Credencial local existente invalida. Arquivo preservado para revisao.")
    else:
        existing = aws("rds", "describe-db-instances")["DBInstances"]
        if any(db.get("DBInstanceIdentifier") == IDENTIFIER for db in existing):
            raise SystemExit(
                "O banco ja existe e a credencial local esta ausente. Recupere a "
                "credencial; este helper nao redefine senhas de bancos existentes."
            )
    versions = aws(
        "rds", "describe-db-engine-versions", "--engine", "postgres"
    )["DBEngineVersions"]
    version, instance_class = select_option([
        v["EngineVersion"] for v in versions
        if v.get("DBParameterGroupFamily") == "postgres18" and v.get("Status") == "available"
    ])
    if not path.exists():
        with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as f:
            json.dump({"db_password": secrets.token_hex(32)}, f)
            f.write("\n")
    path.chmod(0o600)
    values = {"db_engine_version": version, "db_instance_class": instance_class}
    # A versao escolhida fica fixada no arquivo local; nao muda a cada plan.
    with os.fdopen(os.open(settings, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as f:
        json.dump(values, f, indent=2)
        f.write("\n")
    print(f"Selecionado: PostgreSQL {version}, {instance_class}, gp2 20 GiB, Multi-AZ.")
    print("Credencial local criada/preservada; conteudo nao exibido.")
    print("Nenhum recurso AWS foi criado. Proximo passo: terraform init e terraform plan.")


if __name__ == "__main__":
    main()
