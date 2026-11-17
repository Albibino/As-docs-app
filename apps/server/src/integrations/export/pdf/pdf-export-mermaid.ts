import { readFileSync } from 'node:fs';

let mermaidBrowserRuntime: string | null | undefined;

export function hasPdfMermaidBlocks(bodyHtml: string): boolean {
  return /<code\b[^>]*class=["'][^"']*\blanguage-mermaid\b[^"']*["']/i.test(
    bodyHtml,
  );
}

export function buildPdfMermaidScript(bodyHtml: string): string {
  if (!hasPdfMermaidBlocks(bodyHtml)) return '';

  const runtime = getMermaidBrowserRuntime();
  const inlineRuntime = escapeInlineScript(runtime);

  return `<script>
    window.__pdfMermaidReady = false;
    ${inlineRuntime}
    (() => {
      const sourceBlocks = document.querySelectorAll(
        'pre code.language-mermaid',
      );
      const markReady = () => {
        window.__pdfMermaidReady = true;
      };

      if (!sourceBlocks.length || !window.mermaid?.render) {
        markReady();
        return;
      }

      try {
        window.mermaid.initialize({
          startOnLoad: false,
          suppressErrorRendering: true,
          securityLevel: 'strict',
          theme: 'default',
        });
      } catch {
        markReady();
        return;
      }

      Promise.all(
        Array.from(sourceBlocks).map(async (code, index) => {
          const source = code.textContent ?? '';

          try {
            const rendered = await window.mermaid.render(
              'pdf-mermaid-' + index,
              source,
            );
            const diagram = document.createElement('div');
            diagram.className = 'pdf-mermaid';
            diagram.dataset.pdfMermaidRendered = 'true';
            diagram.innerHTML = rendered.svg;
            code.closest('pre')?.replaceWith(diagram);
            rendered.bindFunctions?.(diagram);
          } catch {
            // Keep the original source block visible as the fallback.
          }
        }),
      ).finally(markReady);
    })();
  </script>`;
}

function getMermaidBrowserRuntime(): string {
  if (mermaidBrowserRuntime !== undefined) {
    return mermaidBrowserRuntime ?? '';
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const runtimePath = require.resolve('mermaid/dist/mermaid.min.js');
    mermaidBrowserRuntime = readFileSync(runtimePath, 'utf8');
  } catch {
    mermaidBrowserRuntime = null;
  }

  return mermaidBrowserRuntime ?? '';
}

function escapeInlineScript(value: string): string {
  return value.replace(/<\/script/gi, '<\\/script');
}
