// Past this the base64 copy costs more than the convenience of a
// self-contained file; those images keep their original source.
export const MAX_INLINE_IMAGE_BYTES = 10 * 1024 * 1024;

export interface InlinableAttachment {
  id: string;
  filePath: string;
  mimeType: string | null;
  fileSize: string | number | bigint | null;
}

export interface InlineImagesOptions {
  readFile: (filePath: string) => Promise<Buffer>;
  onReadError?: (attachmentId: string, err: unknown) => void;
}

// Rewrites image sources to data URIs so a single exported file carries its own
// pictures: a lone .html is opened from disk, where `/api/files/...` resolves to
// nothing and the reader gets a broken image icon where the picture was.
//
// Only images are inlined. Base64 costs a third more bytes, and a video or a
// PDF attachment would bloat the document past usefulness.
export async function inlineImages(
  prosemirrorJson: any,
  attachments: InlinableAttachment[],
  options: InlineImagesOptions,
): Promise<any> {
  const dataUris = new Map<string, string>();

  await Promise.all(
    attachments.map(async (attachment) => {
      if (!isInlinable(attachment)) return;

      try {
        const bytes = await options.readFile(attachment.filePath);
        dataUris.set(
          attachment.id,
          `data:${attachment.mimeType};base64,${bytes.toString('base64')}`,
        );
      } catch (err) {
        // A missing file keeps its original src rather than failing the whole
        // export.
        options.onReadError?.(attachment.id, err);
      }
    }),
  );

  if (dataUris.size === 0) return prosemirrorJson;

  return mapNodes(prosemirrorJson, (node) => {
    if (node?.type !== 'image') return node;

    const dataUri = dataUris.get(node.attrs?.attachmentId);
    if (!dataUri) return node;

    return { ...node, attrs: { ...node.attrs, src: dataUri } };
  });
}

function isInlinable(attachment: InlinableAttachment): boolean {
  if (!attachment.mimeType?.startsWith('image/')) return false;
  return Number(attachment.fileSize ?? 0) <= MAX_INLINE_IMAGE_BYTES;
}

function mapNodes(node: any, transform: (node: any) => any): any {
  const mapped = transform(node);
  if (!mapped?.content) return mapped;

  return {
    ...mapped,
    content: mapped.content.map((child: any) => mapNodes(child, transform)),
  };
}
