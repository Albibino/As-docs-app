import { inlineImages, InlinableAttachment } from './inline-images';

const PNG_BYTES = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489',
  'hex',
);
const PNG_DATA_URI = `data:image/png;base64,${PNG_BYTES.toString('base64')}`;

function imageDoc(attrs: Record<string, any> = {}) {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Teste de impressão' }],
      },
      {
        type: 'image',
        attrs: {
          src: '/api/files/att-1/image.png',
          attachmentId: 'att-1',
          ...attrs,
        },
      },
    ],
  };
}

function attachment(
  overrides: Partial<InlinableAttachment> = {},
): InlinableAttachment {
  return {
    id: 'att-1',
    filePath: 'space-1/att-1/image.png',
    mimeType: 'image/png',
    fileSize: PNG_BYTES.length,
    ...overrides,
  };
}

const readsPng = { readFile: async () => PNG_BYTES };

function imageNode(doc: any) {
  return doc.content.find((node: any) => node.type === 'image');
}

describe('inlineImages', () => {
  it('embeds the picture so the file stands alone on disk', async () => {
    const result = await inlineImages(imageDoc(), [attachment()], readsPng);

    expect(imageNode(result).attrs.src).toBe(PNG_DATA_URI);
  });

  it('keeps the other image attributes', async () => {
    const result = await inlineImages(
      imageDoc({ width: 692, align: 'center' }),
      [attachment()],
      readsPng,
    );

    expect(imageNode(result).attrs).toMatchObject({
      width: 692,
      align: 'center',
      attachmentId: 'att-1',
    });
  });

  it('reaches images nested inside other nodes', async () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [
                    {
                      type: 'image',
                      attrs: {
                        src: '/api/files/att-1/image.png',
                        attachmentId: 'att-1',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = await inlineImages(doc, [attachment()], readsPng);
    const cell = result.content[0].content[0].content[0];

    expect(cell.content[0].attrs.src).toBe(PNG_DATA_URI);
  });

  it('leaves the source alone when the file cannot be read', async () => {
    const onReadError = jest.fn();

    const result = await inlineImages(imageDoc(), [attachment()], {
      readFile: async () => {
        throw new Error('gone');
      },
      onReadError,
    });

    expect(imageNode(result).attrs.src).toBe('/api/files/att-1/image.png');
    expect(onReadError).toHaveBeenCalledWith('att-1', expect.any(Error));
  });

  it('skips an image too large to be worth base64', async () => {
    const readFile = jest.fn();

    const result = await inlineImages(
      imageDoc(),
      [attachment({ fileSize: 20 * 1024 * 1024 })],
      { readFile },
    );

    expect(imageNode(result).attrs.src).toBe('/api/files/att-1/image.png');
    expect(readFile).not.toHaveBeenCalled();
  });

  it('skips attachments that are not images', async () => {
    const readFile = jest.fn();

    const result = await inlineImages(
      imageDoc(),
      [attachment({ mimeType: 'application/pdf' })],
      { readFile },
    );

    expect(imageNode(result).attrs.src).toBe('/api/files/att-1/image.png');
    expect(readFile).not.toHaveBeenCalled();
  });

  it('skips an attachment with no recorded type', async () => {
    const result = await inlineImages(
      imageDoc(),
      [attachment({ mimeType: null })],
      readsPng,
    );

    expect(imageNode(result).attrs.src).toBe('/api/files/att-1/image.png');
  });

  it('returns the document untouched when nothing was inlined', async () => {
    const doc = imageDoc();

    const result = await inlineImages(doc, [], readsPng);

    expect(result).toBe(doc);
  });
});
