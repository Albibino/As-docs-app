#!/usr/bin/env python3
"""Teste ponta a ponta do TCC contra a stack do docker-compose.

Cenário obrigatório: o documento está DESATUALIZADO no banco vetorial e
ATUALIZADO na aplicação. A IA precisa perceber a diferença de versão e ler a
página atual pelo MCP (`docs.read_page`) para responder.

Passos:
 1. entra como "Usuário 1" (sem login) e acha o space único;
 2. cria a página "Política de férias <id>" (v1: prazo X) e força a indexação;
 3. pergunta e confere a resposta vinda do índice (prazo X);
 4. "Usuário 2" edita a página (v2: prazo Y) SEM indexar;
 5. pergunta de novo: espera freshness com a página desatualizada, fonte
    `mcp_read` v2 e a resposta com Y e sem X;
 6. pergunta algo que não existe: espera `not_found` com semelhantes;
 7. força a indexação e confere que a v2 entrou e nada foi reindexado.

X e Y são exclusivos de cada execução (`unique_days`), então o teste vale com
os provedores sem chave e com o modelo real, num banco novo ou num banco com
páginas de execuções anteriores.

Uso: python3 scripts/tcc-e2e.py [http://localhost:3001]
Só usa a biblioteca padrão do Python.
"""

from __future__ import annotations

import http.cookiejar
import json
import sys
import time
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3001").rstrip("/")


class Session:
    def __init__(self) -> None:
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def post(self, path: str, body: dict | None = None, raw: bool = False):
        request = urllib.request.Request(
            f"{BASE}/api{path}",
            data=json.dumps(body or {}).encode(),
            headers={"content-type": "application/json"},
            method="POST",
        )
        with self.opener.open(request, timeout=120) as response:
            payload = response.read().decode()
        if raw:
            return payload
        parsed = json.loads(payload) if payload else None
        # O app embrulha as respostas em {data, success, status}.
        return parsed.get("data", parsed) if isinstance(parsed, dict) else parsed

    def ask(self, question: str, context_page_id: str | None = None) -> list[dict]:
        body = {"content": question}
        if context_page_id:
            body["contextPageId"] = context_page_id
        raw = self.post("/ai/chats/send", body, raw=True)
        return [
            json.loads(line[6:])
            for line in raw.splitlines()
            if line.startswith("data: ")
        ]


def check(condition: bool, message: str, detail: object = None) -> None:
    print(("  ok  " if condition else "  FALHOU  ") + message)
    if not condition:
        if detail is not None:
            print(f"     detalhe: {detail!r}")
        raise SystemExit(1)


def doc(text: str) -> dict:
    return {
        "type": "doc",
        "content": [
            {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Prazo de solicitação"}]},
            {"type": "paragraph", "content": [{"type": "text", "text": text}]},
        ],
    }


def wait_ready() -> None:
    for _ in range(90):
        try:
            with urllib.request.urlopen(f"{BASE}/api/health/live", timeout=5):
                return
        except Exception:
            time.sleep(2)
    raise SystemExit("app não ficou pronto")


def index_until_current(session: "Session", page_id: str, timeout: float = 180) -> dict:
    """Roda o indexador até a página alcançar a versão atual.

    O serviço de IA leva ~1 min para subir no compose; até lá o ciclo de
    indexação falha (e o marcador não avança), então tentamos de novo.
    """
    deadline = time.time() + timeout
    while True:
        session.post("/ai/chats/index/run")
        info = session.post("/pages/info", {"pageId": page_id})
        if info["aiIndexedVersion"] == info["contentVersion"] or time.time() > deadline:
            return info
        time.sleep(3)


def unique_days(run_id: int) -> tuple[int, int]:
    """Prazos v1/v2 exclusivos desta execução.

    O banco guarda as páginas de execuções anteriores (e o modelo real lista o
    que cada página diz). Com prazos exclusivos, "a resposta cita o prazo v2 e
    não cita o v1" vale independentemente de quantas páginas parecidas existam,
    sem depender de como o modelo agrupa as citações.
    """
    v1 = 100 + run_id % 400
    return v1, v1 + 500


def answer_text(events: list[dict]) -> str:
    return "".join(event.get("text", "") for event in events if event["type"] == "content")


def by_type(events: list[dict], kind: str) -> dict | None:
    return next((event for event in events if event["type"] == kind), None)


def main() -> None:
    wait_ready()
    user1, user2 = Session(), Session()

    print("1. identidade fixa")
    users = user1.post("/auth/users")
    check([u["name"] for u in users] == ["Usuário 1", "Usuário 2"], "existem exatamente Usuário 1 e Usuário 2")
    user1.post("/auth/select-user", {"userKey": "usuario-1"})
    user2.post("/auth/select-user", {"userKey": "usuario-2"})
    me = user1.post("/users/me")
    check(me["user"]["name"] == "Usuário 1", "sessão do Usuário 1 sem login")
    spaces = user1.post("/spaces", {"limit": 10})["items"]
    check(len(spaces) == 1, f"um único space ({spaces[0]['name']})")
    space_id = spaces[0]["id"]

    print("2. página v1 indexada")
    run_id = int(time.time())
    title = f"Política de férias {run_id}"
    days_v1, days_v2 = unique_days(run_id)
    old, new = f"{days_v1} dias", f"{days_v2} dias"
    page = user1.post(
        "/pages/create",
        {"spaceId": space_id, "title": title, "content": doc(f"O pedido de férias deve ser feito com {old} de antecedência."), "format": "json"},
    )
    page_id = page["id"]
    info = index_until_current(user1, page_id)
    check(info.get("aiIndexedVersion") == info.get("contentVersion"), f"índice na versão atual (v{info.get('contentVersion')})")
    v1 = info["contentVersion"]

    question = f"Segundo a {title}, com quantos dias de antecedência devo pedir férias?"
    print("3. pergunta respondida pelo índice")
    events = user1.ask(question, page_id)
    freshness = by_type(events, "freshness")
    check(freshness is not None and freshness["stalePages"] == [], "nenhuma página desatualizada")
    check(old in answer_text(events), f"resposta cita {old}", answer_text(events))
    check(by_type(events, "done")["found"] is True, "found=true")

    print("4. Usuário 2 edita (v2) sem reindexar")
    user2.post(
        "/pages/update",
        {"pageId": page_id, "content": doc(f"O pedido de férias deve ser feito com {new} de antecedência."), "format": "json", "operation": "replace"},
    )
    info = user1.post("/pages/info", {"pageId": page_id})
    check(info["contentVersion"] > v1, f"app na v{info['contentVersion']}, índice na v{info['aiIndexedVersion']}")

    print("5. pergunta com índice desatualizado -> leitura MCP")
    events = user1.ask(question, page_id)
    freshness = by_type(events, "freshness")
    stale = [p for p in (freshness or {}).get("stalePages", []) if p["pageId"] == page_id]
    check(len(stale) == 1, f"IA detectou a defasagem: indexada v{stale[0]['indexedVersion'] if stale else '?'} vs atual v{stale[0]['currentVersion'] if stale else '?'}")
    sources = by_type(events, "sources")["sources"]
    check(any(s["pageId"] == page_id and s["origin"] == "mcp_read" for s in sources), "fonte veio do docs.read_page (mcp_read)")
    check(
        not any(s["pageId"] == page_id and s["origin"] == "index" for s in sources),
        "nenhum trecho da versão antiga (índice) da página foi usado",
    )
    text = answer_text(events)
    check(
        new in text and old not in text,
        f"resposta usa a versão atual ({new}) e não a antiga ({old})",
        {"resposta": text, "fontes": sources},
    )

    print("6. pergunta sem resposta nos documentos")
    events = user1.ask("Qual é o valor do vale-refeição da empresa?")
    not_found = by_type(events, "not_found")
    check(not_found is not None and by_type(events, "done")["found"] is False, "IA disse que não encontrou")
    check(answer_text(events) == "", "nenhum texto inventado")
    print(f"     semelhantes: {[s['title'] for s in not_found['similar']]}")

    print("7. indexação incremental da v2")
    info = index_until_current(user1, page_id)
    check(info["aiIndexedVersion"] == info["contentVersion"], f"índice alcançou a v{info['contentVersion']}")
    check(user1.post("/ai/chats/index/run")["indexed"] == 0, "nada pendente: nenhuma reindexação")
    events = user1.ask(question, page_id)
    check(by_type(events, "freshness")["stalePages"] == [], "sem defasagem após indexar")
    check(
        new in answer_text(events) and old not in answer_text(events),
        f"índice agora responde {new}",
        {"resposta": answer_text(events), "fontes": by_type(events, "sources")},
    )
    check(
        any(s["pageId"] == page_id and s["origin"] == "index" and s["version"] == info["contentVersion"] for s in by_type(events, "sources")["sources"]),
        "fonte vem do índice na versão nova",
    )

    print("\nE2E OK")


if __name__ == "__main__":
    main()
