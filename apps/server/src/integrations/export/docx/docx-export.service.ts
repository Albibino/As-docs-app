import { Injectable, Logger } from '@nestjs/common';
import { Packer } from 'docx';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@tcc-docs/db/types/kysely.types';
import { Page } from '@tcc-docs/db/types/entity.types';
import { StorageService } from '../../storage/storage.service';
import { EnvironmentService } from '../../environment/environment.service';
import {
  getAttachmentIds,
  getProsemirrorContent,
} from '../../../common/helpers/prosemirror/utils';
import { DocxAttachmentImage, prosemirrorToDocx } from './prosemirror-to-docx';

@Injectable()
export class DocxExportService {
  private readonly logger = new Logger(DocxExportService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly storageService: StorageService,
    private readonly environmentService: EnvironmentService,
  ) {}

  async exportPage(page: Page): Promise<Buffer> {
    const prosemirrorJson = getProsemirrorContent(page.content);

    const document = prosemirrorToDocx(prosemirrorJson, {
      title: page.title || 'untitled',
      images: await this.loadImages(prosemirrorJson, page),
      baseUrl: this.environmentService.getAppUrl(),
    });

    return Packer.toBuffer(document);
  }

  private async loadImages(
    prosemirrorJson: any,
    page: Page,
  ): Promise<Map<string, DocxAttachmentImage>> {
    const attachmentIds = getAttachmentIds(prosemirrorJson);
    if (attachmentIds.length === 0) return new Map();

    // Only attachments that belong to this page are readable here: a page can
    // reference an attachment id it was never granted, and the export must not
    // become a way around that.
    const attachments = await this.db
      .selectFrom('attachments')
      .select(['id', 'filePath'])
      .where('id', 'in', attachmentIds)
      .where('pageId', '=', page.id)
      .where('spaceId', '=', page.spaceId)
      .execute();

    const images = new Map<string, DocxAttachmentImage>();

    await Promise.all(
      attachments.map(async (attachment) => {
        try {
          images.set(attachment.id, {
            data: await this.storageService.read(attachment.filePath),
          });
        } catch (err) {
          // A missing file degrades to a placeholder in the document rather
          // than failing the whole export.
          this.logger.debug(
            `Docx export could not read attachment ${attachment.id}`,
            err,
          );
        }
      }),
    );

    return images;
  }
}
