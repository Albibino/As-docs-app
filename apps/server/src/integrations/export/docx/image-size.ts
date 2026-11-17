export type DocxImageType = 'png' | 'jpg' | 'gif' | 'bmp';

export interface ImageSize {
  width: number;
  height: number;
  type: DocxImageType;
}

// Word needs an explicit box for every picture, so the intrinsic size has to be
// read before the image can be placed. Only the four formats `docx` accepts are
// worth parsing, and their headers are small enough that a dependency would buy
// nothing.
export function readImageSize(buffer: Buffer): ImageSize | null {
  return (
    readPng(buffer) ?? readGif(buffer) ?? readBmp(buffer) ?? readJpeg(buffer)
  );
}

function readPng(buffer: Buffer): ImageSize | null {
  if (buffer.length < 24) return null;
  if (buffer.readUInt32BE(0) !== 0x89504e47) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    type: 'png',
  };
}

function readGif(buffer: Buffer): ImageSize | null {
  if (buffer.length < 10) return null;
  if (buffer.toString('ascii', 0, 3) !== 'GIF') return null;
  return {
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8),
    type: 'gif',
  };
}

function readBmp(buffer: Buffer): ImageSize | null {
  if (buffer.length < 26) return null;
  if (buffer.toString('ascii', 0, 2) !== 'BM') return null;
  return {
    width: buffer.readInt32LE(18),
    height: Math.abs(buffer.readInt32LE(22)),
    type: 'bmp',
  };
}

function readJpeg(buffer: Buffer): ImageSize | null {
  if (buffer.length < 4) return null;
  if (buffer.readUInt16BE(0) !== 0xffd8) return null;

  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    // SOF0..SOF15 carry the frame header, minus the four markers reused for
    // other purposes.
    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;

    if (isStartOfFrame) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
        type: 'jpg',
      };
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) return null;
    offset += 2 + segmentLength;
  }

  return null;
}
