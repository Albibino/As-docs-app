import { htmlToMarkdown } from '@tcc-docs/editor-ext';
import { jsonToHtml, jsonToText } from '../../collaboration/collaboration.util';

/**
 * Markdown da página, igual ao da exportação: é o texto que o tcc-docs-ai
 * corta em trechos (pelos headings) e indexa. Se a conversão falhar por algum
 * nó exótico, cai para o texto puro — melhor indexar sem formatação do que
 * deixar a versão fora do índice.
 */
export function pageContentToMarkdown(content: unknown): string {
  if (!content) return '';
  if (typeof content === 'string') {
    const raw = content;
    try {
      content = JSON.parse(raw);
    } catch {
      return raw.trim();
    }
  }
  try {
    const html = jsonToHtml(content).replace(
      /<colgroup[^>]*>[\s\S]*?<\/colgroup>/gim,
      '',
    );
    return htmlToMarkdown(html).trim();
  } catch {
    try {
      return jsonToText(content as any).trim();
    } catch {
      return '';
    }
  }
}
