#!/usr/bin/env python3
"""Cria documentos de exemplo para testar o TCC à mão e indexa todos.

Uso: python3 scripts/tcc-seed-demo.py [http://localhost:3001]
Idempotente: não recria uma página que já exista com o mesmo título.
Só usa a biblioteca padrão do Python.
"""

from __future__ import annotations

import importlib.util
import sys
import time
from pathlib import Path

spec = importlib.util.spec_from_file_location("e2e", Path(__file__).with_name("tcc-e2e.py"))
e2e = importlib.util.module_from_spec(spec)
spec.loader.exec_module(e2e)  # type: ignore[union-attr]

PAGES = {
    "Política de férias": """## Prazo de solicitação

O pedido de férias deve ser feito com 30 dias de antecedência, pelo sistema de RH.

## Divisão

As férias podem ser divididas em até três períodos. Um deles precisa ter pelo menos 14 dias.

## Aprovação

O gestor direto aprova ou recusa o pedido em até 5 dias úteis.
""",
    "Reembolso de despesas": """## O que é reembolsável

Transporte por aplicativo em visitas a clientes, refeições em viagem e hospedagem.

## Limites

- Refeição: até R$ 80 por dia.
- Hospedagem: até R$ 350 por noite.

## Como pedir

Envie a nota fiscal pelo sistema financeiro em até 30 dias após a despesa.
""",
    "Onboarding": """## Primeiro dia

no primeiro dia o colaborador recebe o notebook e tem q fazer o cadastro no sistema de ponto e tambem ler a politica de ferias

## Primeira semana

Reunião com o gestor para definir as metas dos primeiros 90 dias.
""",
}


def main() -> None:
    e2e.wait_ready()
    session = e2e.Session()
    session.post("/auth/select-user", {"userKey": "usuario-1"})
    space = session.post("/spaces", {"limit": 10})["items"][0]
    existing = {
        page["title"]
        for page in session.post("/pages/recent", {"limit": 100}).get("items", [])
    }
    for title, markdown in PAGES.items():
        if title in existing:
            print(f"  já existe: {title}")
            continue
        session.post(
            "/pages/create",
            {"spaceId": space["id"], "title": title, "format": "markdown", "content": markdown},
        )
        print(f"  criada:    {title}")

    deadline = time.time() + 180
    while True:
        result = session.post("/ai/chats/index/run")
        pending = [
            page["title"]
            for page in session.post("/pages/recent", {"limit": 100}).get("items", [])
            if page["title"] in PAGES
            and (info := session.post("/pages/info", {"pageId": page["id"]}))["aiIndexedVersion"]
            < info["contentVersion"]
        ]
        if not pending:
            print(f"  índice em dia ({result.get('indexed', 0)} enviadas nesta rodada)")
            break
        if time.time() > deadline:
            raise SystemExit(f"índice não alcançou: {pending}")
        time.sleep(3)
    print(f"\nPronto: abra {e2e.BASE} e escolha \"Usuário 1\".")


if __name__ == "__main__":
    e2e.BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3001").rstrip("/")
    main()
