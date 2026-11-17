// Teste de navegador da escrita assistida (Playwright via playwright-core, que já
// é dependência do apps/server). Roda contra a stack do docker-compose.
//
// Uso: node scripts/tcc-assisted-writing-ui.cjs [http://localhost:3001]
// Gera capturas em $TCC_SHOTS (padrão: ./tcc-shots).
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(
  require.resolve('playwright-core', {
    paths: [path.join(__dirname, '..', 'apps', 'server')],
  }),
);

const BASE = (process.argv[2] || 'http://localhost:3001').replace(/\/$/, '');
const SHOTS = process.env.TCC_SHOTS || path.join(process.cwd(), 'tcc-shots');
fs.mkdirSync(SHOTS, { recursive: true });

function ok(condition, message, detail) {
  console.log(`${condition ? '  ok  ' : '  FALHOU  '}${message}`);
  if (!condition) {
    if (detail !== undefined) console.log('     detalhe:', detail);
    throw new Error(message);
  }
}

async function api(page, url, body) {
  return page.evaluate(
    async ([u, b]) => {
      const r = await fetch(u, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(b ?? {}),
      });
      const j = await r.json();
      return j.data ?? j;
    },
    [`${BASE}/api${url}`, body],
  );
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.TCC_CHROMIUM || undefined,
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  const streams = [];
  const unauthorized = [];
  const streamBodies = [];
  page.on('response', async (r) => {
    if (r.url().includes('/api/ai/assisted-writing/stream')) {
      streamBodies.push(await r.text().catch((e) => `<sem corpo: ${e.message}>`));
    }
    if (r.url().includes('/api/ai/assisted-writing/')) streams.push(`${r.status()} ${r.url().split('/api')[1]}`);
    if (r.status() === 401) unauthorized.push(r.url().replace(BASE, ''));
  });
  let userChosen = false;

  try {
    console.log('1. escolher usuário');
    await page.goto(BASE);
    await page.getByText('Usuário 1', { exact: true }).first().click();
    await page.waitForLoadState('networkidle');
    userChosen = true;
    ok(true, 'Usuário 1 escolhido');
    const beforeChoice = [...unauthorized];
    unauthorized.length = 0;

    console.log('2. criar página com texto a corrigir');
    const spaces = await api(page, '/spaces', { limit: 10 });
    const space = spaces.items[0];
    const title = `Onboarding UI ${Date.now()}`;
    const wrong =
      'no primeiro dia o colaborador recebe o notebook e tem q fazer o cadastro no sistema de ponto';
    const created = await api(page, '/pages/create', {
      spaceId: space.id,
      title,
      format: 'markdown',
      content: wrong,
    });
    await page.goto(`${BASE}/s/${space.slug}/p/${created.slugId}`);
    // O título também é um ProseMirror; o corpo é o editor que contém o texto.
    const editor = page
      .locator('.ProseMirror[contenteditable="true"]')
      .filter({ hasNotText: title })
      .first();
    await editor.waitFor({ timeout: 30_000 });
    await page.getByText(wrong).first().waitFor({ timeout: 30_000 });
    ok(true, `página aberta no editor (${title})`);
    await page.screenshot({ path: path.join(SHOTS, '1-pagina.png') });

    console.log('3. pedir à IA');
    await page.getByLabel('Abrir escrita assistida').click();
    const input = page.getByPlaceholder(/Peça mudança/);
    await input.waitFor();
    await input.fill('Corrija a ortografia e a pontuação deste parágrafo, sem mudar o sentido.');
    await page.getByLabel('Enviar pedido').click();
    const accept = page.getByRole('button', { name: 'Aceitar seguras' });
    await accept.waitFor({ timeout: 90_000 });
    const panel = page.locator('[class*="panel"]').filter({ hasText: 'Escrita assistida' }).first();
    const proposal = await panel.innerText();
    // O rótulo é exibido em caixa alta pelo CSS (innerText reflete isso).
    const label = proposal.split('\n').find((l) => /^alterar /i.test(l)) || '';
    ok(/^alterar parágrafo$/i.test(label.trim()), 'proposta com rótulo legível ("Alterar parágrafo")', proposal);
    ok(proposal.includes('tem que') || !proposal.includes(' tem q '), 'proposta traz o texto corrigido', proposal);
    await page.screenshot({ path: path.join(SHOTS, '2-proposta.png') });

    console.log('4. aceitar e conferir o documento');
    await accept.click();
    await page.waitForTimeout(1500);
    const text = (await editor.innerText()).trim();
    ok(!text.includes(' tem q '), 'texto corrigido no editor', text);
    ok(/^No primeiro dia/.test(text), 'frase começa com maiúscula', text);
    ok(/notebook/.test(text) && /ponto/.test(text), 'sentido preservado (notebook, ponto)', text);
    await page.screenshot({ path: path.join(SHOTS, '3-aceito.png') });

    // A colaboração grava no banco com atraso (debounce do Hocuspocus).
    let saved = '';
    for (let i = 0; i < 20; i += 1) {
      const info = await api(page, '/pages/info', { pageId: created.id });
      saved = JSON.stringify(info.content ?? '');
      if (!saved.includes(' tem q ')) break;
      await page.waitForTimeout(1000);
    }
    ok(!saved.includes(' tem q ') && saved.includes('No primeiro dia'), 'alteração persistida no banco', saved.slice(0, 300));
    ok(await page.getByRole('button', { name: 'Desfazer aplicação IA' }).isVisible(), 'botão de desfazer disponível');

    console.log('5. desfazer');
    await page.getByRole('button', { name: 'Desfazer aplicação IA' }).click();
    await page.waitForTimeout(1500);
    const restored = (await editor.innerText()).trim();
    ok(restored.includes(' tem q '), 'texto original restaurado', restored);
    await page.screenshot({ path: path.join(SHOTS, '4-desfeito.png') });

    console.log('6. pedido fora do escopo da página');
    await input.fill('Qual é a capital da França?');
    await page.getByLabel('Enviar pedido').click();
    await page.waitForTimeout(500);
    await page.locator('[class*="panel"] .mantine-Loader-root').waitFor({ state: 'detached', timeout: 90_000 }).catch(() => {});
    await page.waitForTimeout(1000);
    ok(!(await accept.isVisible()), 'nenhuma alteração proposta');
    const panelText = await panel.innerText();
    ok(!panelText.includes('Algo deu errado'), 'sem mensagem de erro genérica', panelText);
    ok(/nenhuma alteração proposta/i.test(panelText), 'painel explica que nada foi proposto', panelText);
    ok(panelText.includes('Qual é a capital da França?'), 'pergunta fica no histórico do painel', panelText);
    const unchanged = (await editor.innerText()).trim();
    ok(unchanged === restored, 'documento intacto', unchanged);
    await page.screenshot({ path: path.join(SHOTS, '5-fora-do-escopo.png') });

    console.log('\nrequisições da escrita assistida:', streams);
    // 401 antes de escolher o usuário é esperado (o app consulta a sessão e
    // mostra a tela de escolha). Depois de escolher, nenhum 401 é aceitável.
    console.log('401 antes da escolha (esperado):', beforeChoice);
    ok(unauthorized.length === 0, 'nenhum 401 depois de escolher o usuário', unauthorized);
    console.log('\nUI OK');
  } catch (error) {
    await page.screenshot({ path: path.join(SHOTS, 'erro.png') }).catch(() => {});
    console.log('requisições:', streams);
    console.log('corpos do stream:', streamBodies);
    console.log('401:', unauthorized, 'usuário escolhido:', userChosen);
    console.log('erros de console:', consoleErrors);
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
