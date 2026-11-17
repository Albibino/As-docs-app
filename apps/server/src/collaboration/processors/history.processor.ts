import { Logger, OnModuleDestroy } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import {
  IPageBacklinkJob,
  IPageHistoryJob,
  IPageUpdateNotificationJob,
} from '../../integrations/queue/constants/queue.interface';
import {
  extractMentions,
  extractPageMentions,
  extractInternalLinkSlugIds,
} from '../../common/helpers/prosemirror/utils';
import { PageHistoryRepo } from '@tcc-docs/db/repos/page/page-history.repo';
import { PageRepo } from '@tcc-docs/db/repos/page/page.repo';
import { Page } from '@tcc-docs/db/types/entity.types';
import { isDeepStrictEqual } from 'node:util';
import { CollabHistoryService } from '../services/collab-history.service';
import { WatcherService } from '../../core/watcher/watcher.service';
import { isEmptyParagraphDoc } from '../collaboration.util';

@Processor(QueueName.HISTORY_QUEUE)
export class HistoryProcessor extends WorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger(HistoryProcessor.name);

  constructor(
    private readonly pageHistoryRepo: PageHistoryRepo,
    private readonly pageRepo: PageRepo,
    private readonly collabHistory: CollabHistoryService,
    private readonly watcherService: WatcherService,
    @InjectQueue(QueueName.NOTIFICATION_QUEUE) private notificationQueue: Queue,
    @InjectQueue(QueueName.GENERAL_QUEUE) private generalQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<IPageHistoryJob, void>): Promise<void> {
    if (job.name !== QueueJob.PAGE_HISTORY) return;

    const { pageId } = job.data;
    let restoreState: Awaited<
      ReturnType<CollabHistoryService['getRestorePending']>
    >;
    try {
      restoreState = await this.collabHistory.getRestorePending(pageId);
    } catch (err) {
      // Redis is coordination state only. If it is temporarily unavailable,
      // continue with the persisted-history lookup below; this prevents a
      // committed page save from being lost and avoids surfacing raw Redis
      // errors to the queue consumer.
      this.logger.warn(
        `Failed to read restore marker for ${pageId}; using database fallback: ${err instanceof Error ? err.message : String(err)}`,
      );
      restoreState = undefined;
    }

    // Old jobs must not consume the contributors accumulated for a newer
    // restore/edit cycle. They carry neither the current token nor timestamp.
    if (
      restoreState &&
      (!job.data.restoreToken ||
        job.data.restoreToken !== restoreState.token ||
        !job.data.enqueuedAt ||
        job.data.enqueuedAt < restoreState.markedAt)
    ) {
      return;
    }

    try {
      const page = await this.pageRepo.findById(pageId, {
        includeContent: true,
      });

      if (!page) {
        this.logger.warn(`Page ${pageId} not found, skipping history`);
        await this.collabHistory.clearContributors(pageId);
        return;
      }

      if (restoreState) {
        const targetRevision = await this.pageHistoryRepo.findById(
          restoreState.targetRevisionId,
          { includeContent: true },
        );

        // Hocuspocus' write that applies the restored revision is not a new
        // revision. Keep the marker so a later edit keeps the short debounce.
        if (targetRevision && this.hasSameSnapshot(targetRevision, page)) {
          await this.collabHistory.clearContributors(pageId);
          return;
        }

        await this.saveHistory(page, targetRevision, restoreState);
        return;
      }

      const lastHistory = await this.pageHistoryRepo.findPageLastHistory(
        pageId,
        { includeContent: true },
      );

      if (!lastHistory && isEmptyParagraphDoc(page.content as any)) {
        this.logger.debug(
          `Skipping first history for page ${pageId}: empty content`,
        );
        await this.collabHistory.clearContributors(pageId);
        return;
      }

      if (lastHistory && this.hasSameSnapshot(lastHistory, page)) {
        return;
      }
      // Redis is deliberately best-effort for restores. The target can be
      // manual, so when Redis did not provide a marker compare all history.
      const existingSnapshot =
        await this.pageHistoryRepo.findLatestMatchingHistory(
          pageId,
          page.title,
          page.content,
        );

      if (existingSnapshot && this.hasSameMetadata(existingSnapshot, page)) {
        await this.collabHistory.clearContributors(pageId);
      } else {
        await this.saveHistory(page, lastHistory);
      }
    } catch (err) {
      throw err;
    }
  }

  private hasSameSnapshot(
    snapshot: {
      title?: string;
      content: unknown;
      icon?: string | null;
      coverPhoto?: string | null;
    },
    page: Pick<Page, 'title' | 'content' | 'icon' | 'coverPhoto'>,
  ): boolean {
    return (
      snapshot.title === page.title &&
      snapshot.icon === page.icon &&
      snapshot.coverPhoto === page.coverPhoto &&
      isDeepStrictEqual(snapshot.content, page.content)
    );
  }

  private hasSameMetadata(
    snapshot: { icon?: string | null; coverPhoto?: string | null },
    page: Pick<Page, 'icon' | 'coverPhoto'>,
  ): boolean {
    return (
      snapshot.icon === page.icon && snapshot.coverPhoto === page.coverPhoto
    );
  }

  private async saveHistory(
    page: Page,
    lastHistory?: { content?: unknown },
    restoreState?: { token: string; markedAt: number },
  ): Promise<string | undefined> {
    const existingSnapshot = restoreState
      ? await this.pageHistoryRepo.findLatestMatchingSnapshotAfter(
          page.id,
          page.title,
          page.content,
          new Date(restoreState.markedAt),
        )
      : undefined;

    if (existingSnapshot && this.hasSameMetadata(existingSnapshot, page)) {
      if (restoreState) {
        await this.clearRestorePendingBestEffort(page.id, restoreState.token);
      }
      await this.collabHistory.clearContributors(page.id);
      return existingSnapshot.id;
    }

    const contributorIds = await this.collabHistory.popContributors(page.id);

    try {
      await this.watcherService.addPageWatchers(
        contributorIds,
        page.id,
        page.spaceId,
        page.workspaceId,
      );

      const history = await this.pageHistoryRepo.saveHistory(page, {
        contributorIds,
      });
      this.logger.debug(`History created for page: ${page.id}`);
      if (restoreState) {
        await this.clearRestorePendingBestEffort(page.id, restoreState.token);
      }

      const mentions = extractMentions(page.content);
      const pageMentions = extractPageMentions(mentions);
      const internalLinkSlugIds = extractInternalLinkSlugIds(page.content);

      await this.generalQueue
        .add(QueueJob.PAGE_BACKLINKS, {
          pageId: page.id,
          workspaceId: page.workspaceId,
          mentions: pageMentions,
          internalLinkSlugIds,
        } as IPageBacklinkJob)
        .catch((err) => {
          this.logger.error(
            `Failed to queue backlinks for ${page.id}: ${err.message}`,
          );
        });

      if (contributorIds.length > 0 && lastHistory?.content) {
        await this.notificationQueue
          .add(QueueJob.PAGE_UPDATED, {
            pageId: page.id,
            spaceId: page.spaceId,
            workspaceId: page.workspaceId,
            actorIds: contributorIds,
          } as IPageUpdateNotificationJob)
          .catch((err) => {
            this.logger.error(
              `Failed to queue page update notification for ${page.id}: ${err.message}`,
            );
          });
      }

      return history?.id;
    } catch (err) {
      await this.collabHistory.addContributors(page.id, contributorIds);
      throw err;
    }
  }

  private async clearRestorePendingBestEffort(
    pageId: string,
    token: string,
  ): Promise<void> {
    try {
      await this.collabHistory.clearRestorePending(pageId, token);
    } catch (err) {
      this.logger.error(
        `Failed to clear restore marker for ${pageId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    this.logger.debug(`Processing ${job.name} for page: ${job.data.pageId}`);
  }

  @OnWorkerEvent('failed')
  onError(job: Job) {
    this.logger.error(
      `Failed ${job.name} for page: ${job.data.pageId}. Reason: ${job.failedReason}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
