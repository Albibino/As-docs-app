import { Readable } from 'node:stream';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AttachmentController } from './attachment.controller';
import { JwtType } from '../auth/dto/jwt-payload';

const ATTACHMENT_ID = '11111111-1111-4111-8111-111111111111';
const PAGE_ID = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';

function build() {
  const storageService = {
    readStream: jest.fn().mockResolvedValue(Readable.from(['image'])),
  };
  const attachmentRepo = {
    findById: jest.fn().mockResolvedValue({
      id: ATTACHMENT_ID,
      pageId: PAGE_ID,
      workspaceId: WORKSPACE_ID,
      filePath: 'attachments/example.png',
      fileName: 'example.png',
      fileExt: '.png',
      fileSize: 5,
      mimeType: 'image/png',
    }),
  };
  const tokenService = {
    verifyJwt: jest.fn().mockResolvedValue({
      attachmentId: ATTACHMENT_ID,
      pageId: PAGE_ID,
      workspaceId: WORKSPACE_ID,
      type: JwtType.ATTACHMENT,
    }),
  };
  const controller = new AttachmentController(
    {} as any,
    storageService as any,
    {} as any,
    {} as any,
    {} as any,
    attachmentRepo as any,
    {} as any,
    {} as any,
    tokenService as any,
  );
  const reply = {
    header: jest.fn().mockReturnThis(),
    headers: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };

  return { controller, storageService, attachmentRepo, tokenService, reply };
}

describe('AttachmentController public files', () => {
  it('serves an attachment when its signed public token matches the attachment, page, and workspace', async () => {
    const { controller, attachmentRepo, tokenService, storageService, reply } =
      build();

    await controller.getPublicFile(
      { headers: {} } as any,
      reply as any,
      ATTACHMENT_ID,
      'example.png',
      'signed-token',
    );

    expect(tokenService.verifyJwt).toHaveBeenCalledWith(
      'signed-token',
      JwtType.ATTACHMENT,
    );
    expect(attachmentRepo.findById).toHaveBeenCalledWith(ATTACHMENT_ID);
    expect(storageService.readStream).toHaveBeenCalledWith(
      'attachments/example.png',
    );
    expect(reply.headers).toHaveBeenCalledWith(
      expect.objectContaining({ 'Content-Type': 'image/png' }),
    );
  });

  it('returns unauthorized for an invalid public token', async () => {
    const { controller, attachmentRepo, tokenService, reply } = build();
    tokenService.verifyJwt.mockRejectedValue(new Error('invalid signature'));

    await expect(
      controller.getPublicFile(
        { headers: {} } as any,
        reply as any,
        ATTACHMENT_ID,
        'example.png',
        'invalid-token',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(attachmentRepo.findById).not.toHaveBeenCalled();
  });

  it('rejects a token whose page does not own the attachment', async () => {
    const { controller, attachmentRepo, tokenService, reply } = build();
    tokenService.verifyJwt.mockResolvedValue({
      attachmentId: ATTACHMENT_ID,
      pageId: '44444444-4444-4444-8444-444444444444',
      workspaceId: WORKSPACE_ID,
      type: JwtType.ATTACHMENT,
    });

    await expect(
      controller.getPublicFile(
        { headers: {} } as any,
        reply as any,
        ATTACHMENT_ID,
        'example.png',
        'signed-token',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(attachmentRepo.findById).toHaveBeenCalledWith(ATTACHMENT_ID);
  });
});
