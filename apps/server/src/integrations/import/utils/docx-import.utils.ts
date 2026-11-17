import { createHash } from 'node:crypto';
import * as path from 'node:path';
import { load } from 'cheerio';

// Fingerprint of the specific banner from the reported DOCX, not a position rule.
const EXCLUDED_DOCX_IMAGE_SHA256 =
  '47e48109d026897df87f7818e9c71f8b1418459ae0ff38922eabe41f3310b558';
const OMITTED_IMAGE_ATTRIBUTE = 'data-docx-import-omit';

export function sha256DocxImage(imageBuffer: Buffer): string {
  return createHash('sha256').update(imageBuffer).digest('hex');
}

export function shouldOmitDocxImageHash(sha256: string): boolean {
  return sha256.toLowerCase() === EXCLUDED_DOCX_IMAGE_SHA256;
}

export function omittedDocxImageAttributes() {
  return {
    src: '',
    [OMITTED_IMAGE_ATTRIBUTE]: 'cover',
  };
}

export function removeOmittedDocxImages(html: string): string {
  const $ = load(html, {}, false);
  $(`[${OMITTED_IMAGE_ATTRIBUTE}]`).each((_index, image) => {
    const paragraph = $(image).closest('p');
    $(image).remove();

    if (
      paragraph.length &&
      !paragraph.text().trim() &&
      !paragraph.find('img, video, audio, iframe, object, svg, table, a').length
    ) {
      paragraph.remove();
    }
  });
  return $.html() || '';
}

export function normalizeDocxImportTitle(title: string): string {
  return title.replace(/(?:\s*\.\s*doc|\s+doc)+\s*$/i, '').trim();
}

export function getDocxImportFileTitle(fileName: string): string {
  const extension = path.extname(fileName);
  return normalizeDocxImportTitle(path.basename(fileName, extension));
}
