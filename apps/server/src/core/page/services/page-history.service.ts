import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { PageHistoryRepo } from '@tcc-docs/db/repos/page/page-history.repo';
import { PageRepo } from '@tcc-docs/db/repos/page/page.repo';
import { Page, PageHistory, User } from '@tcc-docs/db/types/entity.types';
import { KyselyDB } from '@tcc-docs/db/types/kysely.types';
import { executeTx } from '@tcc-docs/db/utils';
import { PaginationOptions } from '@tcc-docs/db/pagination/pagination-options';
import { CursorPaginationResult } from '@tcc-docs/db/pagination/cursor-pagination';
import {
  RestorePageHistoryDto,
  SaveManualPageHistoryDto,
} from '../dto/page.dto';
import {
  CollabHistoryService,
  PageHistoryRestoreRequestResult,
} from '../../../collaboration/services/collab-history.service';
import { randomUUID } from 'crypto';

const IDEMPOTENCY_WAIT_ATTEMPTS = 100;
const IDEMPOTENCY_WAIT_INTERVAL_MS = 50;
const IDEMPOTENCY_COMPLETE_ATTEMPTS = 3;

export interface RestoreSnapshotResult {
  snapshot: PageHistory;
  targetRevisionId: string;
  restoreToken?: string;
}

@Injectable()
export class PageHistoryService {
  private readonly logger = new Logger(PageHistoryService.name);

  constructor(
    private pageHistoryRepo: PageHistoryRepo,
    private pageRepo?: PageRepo,
    @InjectKysely() private db?: KyselyDB,
    private collabHistory?: CollabHistoryService,
  ) {}

  async findById(historyId: string): Promise<PageHistory> {
    return await this.pageHistoryRepo.findById(historyId, {
      includeContent: true,
    });
  }

  async findHistoryByPageId(
    pageId: string,
    paginationOptions: PaginationOptions,
  ): Promise<CursorPaginationResult<PageHistory>> {
    return this.pageHistoryRepo.findPageHistoryByPageId(
      pageId,
      paginationOptions,
    );
  }

  async saveManualVersion(
    page: Page,
    dto: Omit<SaveManualPageHistoryDto, 'pageId'>,
    user: User,
  ): Promise<PageHistory> {
    return this.pageHistoryRepo.insertPageHistory({
      pageId: page.id,
      slugId: page.slugId,
      title: dto.title,
      content: dto.content as any,
      icon: page.icon,
      coverPhoto: page.coverPhoto,
      lastUpdatedById: user.id,
      contributorIds: [user.id],
      spaceId: page.spaceId,
      workspaceId: page.workspaceId,
      kind: 'manual',
      description: dto.description,
    });
  }

  async snapshotBeforeRestore(
    page: Page,
    dto: RestorePageHistoryDto,
    user: User,
  ): Promise<RestoreSnapshotResult> {
    const request = dto.requestId
      ? await this.prepareRestoreRequest(page.id, dto.requestId)
      : { reserved: false, redisAvailable: true };

    if (request.result) {
      return request.result;
    }

    if (!this.pageRepo || !this.db) {
      throw new Error('Page history restore dependencies are unavailable');
    }

    let snapshot: PageHistory;
    try {
      snapshot = await executeTx(this.db, async (trx) => {
        const lockedPage = await this.pageRepo.findById(page.id, {
          withLock: true,
          includeContent: true,
          trx,
        });
        if (
          !lockedPage ||
          lockedPage.deletedAt ||
          lockedPage.workspaceId !== page.workspaceId
        ) {
          throw new NotFoundException('Page not found');
        }

        const targetRevision = await this.pageHistoryRepo.findById(
          dto.historyId,
          { includeContent: true, trx },
        );
        if (!targetRevision || targetRevision.pageId !== lockedPage.id) {
          throw new BadRequestException('History revision mismatch');
        }

        const existingSnapshot =
          await this.pageHistoryRepo.findLatestMatchingSnapshot(
            lockedPage.id,
            dto.title,
            dto.content,
            trx,
          );
        if (existingSnapshot) return existingSnapshot;

        return this.pageHistoryRepo.insertPageHistory(
          {
            pageId: lockedPage.id,
            slugId: lockedPage.slugId,
            title: dto.title,
            content: dto.content as any,
            icon: lockedPage.icon,
            coverPhoto: lockedPage.coverPhoto,
            lastUpdatedById: user.id,
            contributorIds: [user.id],
            spaceId: lockedPage.spaceId,
            workspaceId: lockedPage.workspaceId,
            kind: 'automatic',
            description: undefined,
          },
          trx,
        );
      });
    } catch (error) {
      if (
        dto.requestId &&
        request.reserved &&
        request.reservationToken &&
        this.collabHistory
      ) {
        try {
          await this.collabHistory.clearRestoreRequest(
            page.id,
            dto.requestId,
            request.reservationToken,
          );
        } catch (redisError) {
          this.logRedisFailure('clear failed restore request', redisError);
        }
      }
      throw error;
    }

    let restoreToken: string | undefined;
    if (this.collabHistory) {
      const token = randomUUID();
      try {
        await this.collabHistory.markRestorePending(page.id, {
          token,
          targetRevisionId: dto.historyId,
          snapshotId: snapshot.id,
          markedAt: Date.now(),
        });
        restoreToken = token;
      } catch (error) {
        this.logRedisFailure('mark restore pending', error);
      }
    }

    if (
      dto.requestId &&
      request.reserved &&
      request.reservationToken &&
      request.redisAvailable &&
      this.collabHistory
    ) {
      await this.completeRestoreRequest(
        page.id,
        dto.requestId,
        request.reservationToken,
        {
          status: 'done',
          snapshotId: snapshot.id,
          targetRevisionId: dto.historyId,
          restoreToken,
        },
      );
    }

    return {
      snapshot,
      targetRevisionId: dto.historyId,
      ...(restoreToken ? { restoreToken } : {}),
    };
  }

  /**
   * Histórico paginado da página com o id da revisão atual. TCC: a publicação
   * de páginas foi removida, então não há mais revisão publicada.
   */
  async findHistoryByPageIdWithCurrent(
    pageId: string,
    paginationOptions: PaginationOptions,
  ) {
    const [history, current] = await Promise.all([
      this.pageHistoryRepo.findPageHistoryByPageId(pageId, paginationOptions),
      this.pageHistoryRepo.findPageLastHistory(pageId, {
        includeContent: false,
      }),
    ]);

    return {
      ...history,
      currentRevisionId: current?.id ?? null,
    };
  }


  private async prepareRestoreRequest(
    pageId: string,
    requestId: string,
  ): Promise<{
    reserved: boolean;
    redisAvailable: boolean;
    reservationToken?: string;
    result?: RestoreSnapshotResult;
  }> {
    if (!this.collabHistory) {
      return { reserved: false, redisAvailable: false };
    }

    let existing: PageHistoryRestoreRequestResult | undefined;
    try {
      existing = await this.collabHistory.getRestoreRequest(pageId, requestId);
    } catch (error) {
      this.logRedisFailure('read restore request', error);
      return { reserved: false, redisAvailable: false };
    }

    if (this.isCompleteRestoreRequest(existing)) {
      return {
        reserved: false,
        redisAvailable: true,
        result: await this.restoreResultFromRequest(existing),
      };
    }

    if (existing?.status === 'processing') {
      return this.waitForRestoreRequest(pageId, requestId);
    }

    try {
      const reservationToken = randomUUID();
      const reserved = await this.collabHistory.reserveRestoreRequest(
        pageId,
        requestId,
        reservationToken,
      );
      if (reserved) {
        return { reserved: true, redisAvailable: true, reservationToken };
      }
    } catch (error) {
      this.logRedisFailure('reserve restore request', error);
      return { reserved: false, redisAvailable: false };
    }

    return this.waitForRestoreRequest(pageId, requestId);
  }

  private async waitForRestoreRequest(
    pageId: string,
    requestId: string,
  ): Promise<{
    reserved: boolean;
    redisAvailable: boolean;
    reservationToken?: string;
    result?: RestoreSnapshotResult;
  }> {
    for (let attempt = 0; attempt < IDEMPOTENCY_WAIT_ATTEMPTS; attempt += 1) {
      let request: PageHistoryRestoreRequestResult | undefined;
      try {
        request = await this.collabHistory.getRestoreRequest(pageId, requestId);
      } catch (error) {
        this.logRedisFailure('wait for restore request', error);
        return { reserved: false, redisAvailable: false };
      }

      if (this.isCompleteRestoreRequest(request)) {
        return {
          reserved: false,
          redisAvailable: true,
          result: await this.restoreResultFromRequest(request),
        };
      }

      if (!request) {
        try {
          const reservationToken = randomUUID();
          const reserved = await this.collabHistory.reserveRestoreRequest(
            pageId,
            requestId,
            reservationToken,
          );
          if (reserved) {
            return { reserved: true, redisAvailable: true, reservationToken };
          }
        } catch (error) {
          this.logRedisFailure('reserve released restore request', error);
          return { reserved: false, redisAvailable: false };
        }
      }

      if (attempt < IDEMPOTENCY_WAIT_ATTEMPTS - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, IDEMPOTENCY_WAIT_INTERVAL_MS),
        );
      }
    }

    throw new ServiceUnavailableException(
      'Restore request is still processing',
    );
  }

  private isCompleteRestoreRequest(
    request: PageHistoryRestoreRequestResult | undefined,
  ): request is PageHistoryRestoreRequestResult & {
    snapshotId: string;
    targetRevisionId: string;
  } {
    const status = (request as { status?: 'processing' | 'done' } | undefined)
      ?.status;
    return Boolean(
      request &&
      (status === undefined || status === 'done') &&
      request.snapshotId &&
      request.targetRevisionId,
    );
  }

  private async restoreResultFromRequest(
    request: PageHistoryRestoreRequestResult & {
      snapshotId: string;
      targetRevisionId: string;
    },
  ): Promise<RestoreSnapshotResult> {
    const snapshot = await this.pageHistoryRepo.findById(request.snapshotId, {
      includeContent: true,
    });
    if (!snapshot) {
      throw new ServiceUnavailableException(
        'Restore snapshot is temporarily unavailable',
      );
    }

    return {
      snapshot,
      targetRevisionId: request.targetRevisionId,
      ...(request.restoreToken ? { restoreToken: request.restoreToken } : {}),
    };
  }

  private async completeRestoreRequest(
    pageId: string,
    requestId: string,
    reservationToken: string,
    result: PageHistoryRestoreRequestResult & { status: 'done' },
  ): Promise<void> {
    for (
      let attempt = 0;
      attempt < IDEMPOTENCY_COMPLETE_ATTEMPTS;
      attempt += 1
    ) {
      try {
        const completed = await this.collabHistory.completeRestoreRequest(
          pageId,
          requestId,
          reservationToken,
          result,
        );
        if (completed) return;

        this.logger.warn(
          `Restore request ${requestId} is no longer owned by this operation`,
        );
        return;
      } catch (error) {
        this.logRedisFailure('complete restore request', error);
      }
    }

    try {
      await this.collabHistory.clearRestoreRequest(
        pageId,
        requestId,
        reservationToken,
      );
    } catch (error) {
      this.logRedisFailure('release incomplete restore request', error);
    }
  }

  private logRedisFailure(operation: string, error: unknown): void {
    this.logger.error(
      `Failed to ${operation}; continuing with database deduplication`,
      error instanceof Error ? error.stack : undefined,
    );
  }
}
