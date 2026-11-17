import { Packer } from 'docx';
import * as JSZip from 'jszip';
import { prosemirrorToDocx } from './prosemirror-to-docx';

async function renderDocumentXml(
  prosemirrorJson: any,
  options: Parameters<typeof prosemirrorToDocx>[1] = { title: 'Test page' },
): Promise<string> {
  const buffer = await Packer.toBuffer(
    prosemirrorToDocx(prosemirrorJson, options),
  );
  const zip = await JSZip.loadAsync(buffer);
  return zip.file('word/document.xml').async('string');
}

function paragraph(text: string, marks?: any[]) {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
  };
}

describe('prosemirrorToDocx', () => {
  it('opens the document with the page title', async () => {
    const xml = await renderDocumentXml({ type: 'doc', content: [] });

    expect(xml).toContain('Test page');
    expect(xml).toContain('w:val="Title"');
  });

  it('maps headings to native Word heading styles', async () => {
    const xml = await renderDocumentXml({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Section' }],
        },
      ],
    });

    expect(xml).toContain('w:val="Heading2"');
    expect(xml).toContain('Section');
  });

  it('carries text marks onto the run', async () => {
    const xml = await renderDocumentXml({
      type: 'doc',
      content: [
        paragraph('bold', [{ type: 'bold' }]),
        paragraph('italic', [{ type: 'italic' }]),
        paragraph('struck', [{ type: 'strike' }]),
      ],
    });

    expect(xml).toContain('<w:b/>');
    expect(xml).toContain('<w:i/>');
    expect(xml).toContain('<w:strike/>');
  });

  it('turns links into hyperlink relationships', async () => {
    const xml = await renderDocumentXml({
      type: 'doc',
      content: [
        paragraph('docs', [
          { type: 'link', attrs: { href: 'https://example.com' } },
        ]),
      ],
    });

    expect(xml).toContain('w:hyperlink');
  });

  it('resolves root-relative links against the app url', async () => {
    const xml = await renderDocumentXml(
      {
        type: 'doc',
        content: [
          paragraph('inner page', [
            { type: 'link', attrs: { href: '/s/general/p/abc' } },
          ]),
        ],
      },
      { title: 'Test page', baseUrl: 'https://docs.example.com/' },
    );

    expect(xml).toContain('w:hyperlink');
  });

  it('numbers ordered lists and restarts each new list', async () => {
    const list = {
      type: 'orderedList',
      content: [
        { type: 'listItem', content: [paragraph('one')] },
        { type: 'listItem', content: [paragraph('two')] },
      ],
    };
    const xml = await renderDocumentXml({
      type: 'doc',
      content: [list, list],
    });

    expect(xml).toContain('w:numPr');
    // Two lists get two numbering instances, which is what makes Word restart
    // the second one at 1 instead of continuing to 3.
    const numIds = [...xml.matchAll(/<w:numId w:val="(\d+)"/g)].map(
      (match) => match[1],
    );
    expect(new Set(numIds).size).toBe(2);
  });

  it('indents nested bullet lists one level deeper', async () => {
    const xml = await renderDocumentXml({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                paragraph('outer'),
                {
                  type: 'bulletList',
                  content: [
                    { type: 'listItem', content: [paragraph('inner')] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(xml).toContain('<w:ilvl w:val="0"');
    expect(xml).toContain('<w:ilvl w:val="1"');
  });

  it('marks task items as checked or unchecked', async () => {
    const xml = await renderDocumentXml({
      type: 'doc',
      content: [
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: true },
              content: [paragraph('done')],
            },
            {
              type: 'taskItem',
              attrs: { checked: false },
              content: [paragraph('todo')],
            },
          ],
        },
      ],
    });

    expect(xml).toContain('☒');
    expect(xml).toContain('☐');
  });

  it('keeps every line of a code block', async () => {
    const xml = await renderDocumentXml({
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          content: [{ type: 'text', text: 'const a = 1;\nconst b = 2;' }],
        },
      ],
    });

    expect(xml).toContain('const a = 1;');
    expect(xml).toContain('const b = 2;');
    expect(xml).toContain('Courier New');
  });

  it('builds a real table with a header row', async () => {
    const xml = await renderDocumentXml({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', content: [paragraph('Name')] },
                { type: 'tableHeader', content: [paragraph('Role')] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [paragraph('Davi')] },
                { type: 'tableCell', content: [paragraph('Admin')] },
              ],
            },
          ],
        },
      ],
    });

    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('w:tblHeader');
    expect(xml).toContain('Davi');
  });

  it('embeds an image whose bytes were resolved', async () => {
    // Smallest valid PNG header the size reader accepts: 1x1.
    const png = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489',
      'hex',
    );
    const xml = await renderDocumentXml(
      {
        type: 'doc',
        content: [
          { type: 'image', attrs: { attachmentId: 'a1', alt: 'diagram' } },
        ],
      },
      {
        title: 'Test page',
        images: new Map([['a1', { data: png }]]),
      },
    );

    expect(xml).toContain('<w:drawing>');
  });

  it('leaves a placeholder when the image bytes are missing', async () => {
    const xml = await renderDocumentXml({
      type: 'doc',
      content: [
        { type: 'image', attrs: { attachmentId: 'gone', alt: 'diagram' } },
      ],
    });

    expect(xml).toContain('[diagram]');
    expect(xml).not.toContain('<w:drawing>');
  });

  it('keeps the text of containers Word has no node for', async () => {
    const xml = await renderDocumentXml({
      type: 'doc',
      content: [
        {
          type: 'columns',
          content: [
            { type: 'column', content: [paragraph('left')] },
            { type: 'column', content: [paragraph('right')] },
          ],
        },
        {
          type: 'details',
          content: [
            {
              type: 'detailsSummary',
              content: [{ type: 'text', text: 'More' }],
            },
            { type: 'detailsContent', content: [paragraph('hidden')] },
          ],
        },
      ],
    });

    expect(xml).toContain('left');
    expect(xml).toContain('right');
    expect(xml).toContain('More');
    expect(xml).toContain('hidden');
  });

  it('breaks the page where the editor asked for one', async () => {
    const xml = await renderDocumentXml({
      type: 'doc',
      content: [paragraph('first'), { type: 'pageBreak' }, paragraph('second')],
    });

    expect(xml).toContain('w:pageBreakBefore');
  });
});
