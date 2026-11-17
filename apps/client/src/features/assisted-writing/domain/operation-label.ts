import type { ProposalOperation } from "./assisted-writing";

/**
 * Translator with i18next's call shape. The source strings in this file are
 * written in Brazilian Portuguese and double as translation keys (see the
 * `locales` files), so the default translator only fills in `{{vars}}`.
 */
export type Translate = (
  text: string,
  vars?: Record<string, string | number>,
) => string;

const fillVars: Translate = (text, vars = {}) =>
  text.replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars[name] ?? ""));

function blockName(type: string | undefined, t: Translate): string {
  switch (type) {
    case "paragraph":
      return t("parágrafo");
    case "heading":
      return t("título");
    case "bulletList":
      return t("lista com marcadores");
    case "orderedList":
      return t("lista numerada");
    case "taskList":
      return t("lista de tarefas");
    case "table":
      return t("tabela");
    default:
      return t("bloco");
  }
}

function excerpt(text: string | undefined, max = 40): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export interface BlockInfo {
  type?: string;
  text?: string;
}

/**
 * Rótulo legível de uma operação proposta pela IA.
 *
 * O id do bloco (ex.: "xzybmzcafngh") não diz nada ao usuário; o rótulo usa o
 * tipo do bloco em português e, para inserções, o começo do bloco de referência.
 */
export function operationLabel(
  operation: ProposalOperation,
  lookup: (blockId: string) => BlockInfo | undefined = () => undefined,
  t: Translate = fillVars,
): string {
  switch (operation.action) {
    case "set_title":
      return t('Renomear página para "{{title}}"', { title: operation.title });
    case "add_label":
      return t('Adicionar label "{{label}}"', { label: operation.label });
    case "remove_label":
      return t('Remover label "{{label}}"', { label: operation.label });
    case "insert_after": {
      const anchor = lookup(operation.afterBlockId);
      const where = excerpt(anchor?.text);
      const block = blockName(operation.blockType, t);
      return where
        ? t('Inserir {{block}} após "{{where}}"', { block, where })
        : t("Inserir {{block}}", { block });
    }
    case "replace":
      return t("Alterar {{block}}", {
        block: blockName(lookup(operation.blockId)?.type, t),
      });
    case "delete":
      return t("Remover {{block}}", {
        block: blockName(lookup(operation.blockId)?.type, t),
      });
  }
}

/** Resumo legível da resposta da IA guardada no histórico da sessão. */
export function assistantSummary(
  content: string,
  t: Translate = fillVars,
): string {
  try {
    const value = JSON.parse(content);
    if (Array.isArray(value)) {
      if (!value.length) return t("Nenhuma alteração proposta.");
      return value.length === 1
        ? t("1 alteração proposta.")
        : t("{{total}} alterações propostas.", { total: value.length });
    }
    if (value?.action === "none") {
      return value.reason
        ? t("Nenhuma alteração proposta: {{reason}}", { reason: value.reason })
        : t("Nenhuma alteração proposta.");
    }
  } catch {
    /* histórico antigo ou texto livre */
  }
  return t("Proposta recebida.");
}
