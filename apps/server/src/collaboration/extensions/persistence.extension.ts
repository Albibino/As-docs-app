import {
  afterUnloadDocumentPayload,
  Extension,
  onChangePayload,
  onLoadDocumentPayload,
  onStoreDocumentPayload,
} from '@hocuspocus/server';
import * as Y from 'yjs';
import { Injectable, Logger } from '@nestjs/common';
import { TiptapTransformer } from '@hocuspocus/transformer';
import { jsonToText, tiptapExtensions } from '../collaboration.util';
import { PageRepo } from '@tcc-docs/db/repos/page/page.repo';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@tcc-docs/db/types/kysely.types';
import { executeTx } from '@tcc-docs/db/utils';
import { InjectQueue } from '@nestjs/bullmq';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { Queue } from 'bullmq';
import {
  extractInternalLinkSlugIds,
  extractMentions,
  extractPageMentions,
  extractUserMentions,
} from '../../common/helpers/prosemirror/utils';
import { isDeepStrictEqual } from 'node:util';
import {
  IPageBacklinkJob,
  IPageHistoryJob,
  IPageMentionNotificationJob,
} from '../../integrations/queue/constants/queue.interface';
import { Page, User } from '@tcc-docs/db/types/entity.types';
import { CollabHistoryService } from '../services/collab-history.service';
import {
  HISTORY_FAST_INTERVAL,
  HISTORY_FAST_THRESHOLD,
  HISTORY_INTERVAL,
  HISTORY_RESTORE_INTERVAL,
  STORE_RETRY_DELAYS_MS,
} from '../constants';
import { TransclusionService } from '../../core/page/transclusion/transclusion.service';
import { getCollaborationResource } from '../collaboration.util';

@Injectable()
export class PersistenceExtension implements Extension {
  private readonly logger = new Logger(PersistenceExtension.name);
  private contributors: Map<string, Set<string>> = new Map();
  private historyEnqueueLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly pageRepo: PageRepo,
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(QueueName.AI_QUEUE) private aiQueue: Queue,
    @InjectQueue(QueueName.HISTORY_QUEUE) private historyQueue: Queue,
    @InjectQueue(QueueName.GENERAL_QUEUE) private generalQueue: Queue,
    @InjectQueue(QueueName.NOTIFICATION_QUEUE) private notificationQueue: Queue,
    private readonly collabHistory: CollabHistoryService,
    private readonly transclusionService: TransclusionService,
  ) {}

  async onLoadDocument(data: onLoadDocumentPayload) {
    const { documentName, document } = data;
    const resource = getCollaborationResource(documentName);

    if (!document.isEmpty('default')) {
      return;
    }

    const page = await this.pageRepo.findById(resource.id, {
      includeContent: true,
      includeYdoc: true,
    });

    if (!page) {
      this.logger.warn('page not found');
      return;
    }

    if (page.ydoc) {
      this.logger.debug(`ydoc loaded from db: ${resource.id}`);

      const doc = new Y.Doc();
      const dbState = new Uint8Array(page.ydoc);

      Y.applyUpdate(doc, dbState);
      return doc;
    }

    // if no ydoc state in db convert json in page.content to Ydoc.
    if (page.content) {
      this.logger.debug(`converting json to ydoc: ${resource.id}`);

      const ydoc = TiptapTransformer.toYdoc(
        page.content,
        'default',
        tiptapExtensions,
      );

      Y.encodeStateAsUpdate(ydoc);
      return ydoc;
    }

    this.logger.debug(`creating fresh ydoc: ${resource.id}`);
    return new Y.Doc();
  }

  async onStoreDocument(data: onStoreDocumentPayload) {
    const { documentName, document, lastContext } = data;

    const resource = getCollaborationResource(documentName);


    const pageId = resource.id;

    const tiptapJson = TiptapTransformer.fromYdoc(document, 'default');
    const ydocState = Buffer.from(Y.encodeStateAsUpdate(document));

    let textContent = null;

    try {
      textContent = jsonToText(tiptapJson);
    } catch (err) {
      this.logger.warn('jsonToText' + err?.['message']);
    }

    let page: Page = null;
    const editingUserIds = this.consumeContributors(documentName);

    const writePage = async () => {
      await executeTx(this.db, async (trx) => {
        page = await this.pageRepo.findById(pageId, {
          withLock: true,
          includeContent: true,
          trx,
        });

        if (!page) {
          this.logger.error(`Page with id ${pageId} not found`);
          return;
        }

        if (isDeepStrictEqual(tiptapJson, page.content)) {
          page = null;
          return;
        }

        let contributorIds = undefined;
        try {
          const existingContributors = page.contributorIds || [];
          contributorIds = Array.from(
            new Set([
              ...existingContributors,
              ...editingUserIds,
              page.creatorId,
            ]),
          );
        } catch (err) {
          //this.logger.debug('Contributors error:' + err?.['message']);
        }

        await this.pageRepo.updatePage(
          {
            content: tiptapJson,
            textContent: textContent,
            ydoc: ydocState,
            lastUpdatedById: lastContext.user.id,
            contributorIds: contributorIds,
          },
          pageId,
          trx,
        );

        this.logger.debug(`Page updated: ${pageId} - SlugId: ${page.slugId}`);
      });
    };

    await this.writeWithRetry(writePage, pageId);

    if (page) {
      document.broadcastStateless(
        JSON.stringify({
          type: 'page.updated',
          updatedAt: new Date().toISOString(),
          lastUpdatedById: lastContext?.user?.id,
          lastUpdatedBy: lastContext?.user
            ? {
                id: lastContext.user?.id,
                name: lastContext.user?.name,
                avatarUrl: lastContext.user?.avatarUrl,
              }
            : undefined,
        }),
      );

      await this.syncTransclusion(pageId, page.workspaceId, tiptapJson);
      await this.syncBacklinks(pageId, page.workspaceId, tiptapJson);
    }

    if (page) {
      try {
        await this.collabHistory.addContributors(pageId, editingUserIds);
      } catch (err) {
        this.logger.error(
          `Failed to track contributors for persisted page ${page.id}`,
          err,
        );
      }

      const mentions = extractMentions(tiptapJson);

      const userMentions = extractUserMentions(mentions);
      const oldMentions = page.content ? extractMentions(page.content) : [];
      const oldMentionedUserIds = extractUserMentions(oldMentions).map(
        (m) => m.entityId,
      );

      if (userMentions.length > 0) {
        await this.notificationQueue.add(QueueJob.PAGE_MENTION_NOTIFICATION, {
          userMentions: userMentions.map((m) => ({
            userId: m.entityId,
            mentionId: m.id,
            creatorId: m.creatorId,
          })),
          oldMentionedUserIds,
          pageId,
          spaceId: page.spaceId,
          workspaceId: page.workspaceId,
        } as IPageMentionNotificationJob);
      }

      await this.aiQueue.add(QueueJob.PAGE_CONTENT_UPDATED, {
        pageIds: [pageId],
        workspaceId: page.workspaceId,
      });

      try {
        await this.enqueuePageHistory(page);
      } catch (err) {
        this.logger.error(
          `Failed to enqueue history for persisted page ${page.id}`,
          err,
        );
      }
    }
  }

  async onChange(data: onChangePayload) {
    const documentName = data.documentName;
    const userId = data.context?.user?.id;

    if (!userId) return;

    if (!this.contributors.has(documentName)) {
      this.contributors.set(documentName, new Set());
    }

    this.contributors.get(documentName).add(userId);
  }

  async afterUnloadDocument(data: afterUnloadDocumentPayload) {
    const documentName = data.documentName;
    this.contributors.delete(documentName);
  }

  private consumeContributors(documentName: string): string[] {
    const contributorSet = this.contributors.get(documentName);
    if (!contributorSet) return [];
    const userIds = [...contributorSet];
    this.contributors.delete(documentName);
    return userIds;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Persist the document, retrying across a database outage before giving up.
   *
   * A failed write must not resolve. Hocuspocus treats a resolved
   * `onStoreDocument` as a successful save and unloads the document, which
   * discards the unsaved state; a rejection makes it keep the document in
   * memory instead. The retries cover the case where the last client
   * disconnects mid-outage, since that unloads the document without waiting
   * for another change to trigger a new store.
   */
  private async writeWithRetry(
    write: () => Promise<void>,
    pageId: string,
  ): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        await write();
        if (attempt > 0) {
          this.logger.log(`Page ${pageId} saved after ${attempt + 1} attempts`);
        }
        return;
      } catch (err) {
        const delay = STORE_RETRY_DELAYS_MS[attempt];

        if (delay === undefined) {
          this.logger.error(`Failed to update page ${pageId}`, err);
          throw err;
        }

        this.logger.warn(
          `Failed to update page ${pageId}, retrying in ${delay}ms`,
        );
        await this.sleep(delay);
      }
    }
  }

  private async enqueuePageHistory(page: Page): Promise<void> {
    const restoreState = await this.collabHistory.getRestorePending(page.id);

    if (restoreState) {
      await this.withHistoryEnqueueLock(page.id, async () => {
        // The marker may have changed while this store waited for an earlier
        // store to finish replacing its delayed job.
        const currentRestoreState = await this.collabHistory.getRestorePending(
          page.id,
        );
        if (!currentRestoreState) return;

        await this.replacePendingHistoryJobs(page.id);

        await this.historyQueue.add(
          QueueJob.PAGE_HISTORY,
          {
            pageId: page.id,
            restoreToken: currentRestoreState.token,
            enqueuedAt: Date.now(),
            forceFast: true,
          } as IPageHistoryJob,
          {
            jobId: this.historyJobId(page.id),
            delay: HISTORY_RESTORE_INTERVAL,
          },
        );
      });
      return;
    }

    const pageAge = Date.now() - new Date(page.createdAt).getTime();
    const delay =
      pageAge < HISTORY_FAST_THRESHOLD
        ? HISTORY_FAST_INTERVAL
        : HISTORY_INTERVAL;

    await this.historyQueue.add(
      QueueJob.PAGE_HISTORY,
      { pageId: page.id } as IPageHistoryJob,
      { jobId: page.id, delay },
    );
  }

  private historyJobId(pageId: string): string {
    return `page-history:${pageId}`;
  }

  /** Serializes remove-and-add so the latest local edit renews the debounce. */
  private async withHistoryEnqueueLock<T>(
    pageId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const previous = this.historyEnqueueLocks.get(pageId) ?? Promise.resolve();
    let release: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.historyEnqueueLocks.set(pageId, current);

    await previous.catch(() => undefined);
    try {
      return await task();
    } finally {
      release!();
      if (this.historyEnqueueLocks.get(pageId) === current) {
        this.historyEnqueueLocks.delete(pageId);
      }
    }
  }

  /** Replaces delayed jobs without interrupting a worker already in flight. */
  private async replacePendingHistoryJobs(pageId: string): Promise<void> {
    await Promise.all(
      [this.historyJobId(pageId), pageId].map(async (jobId) => {
        try {
          const job = await this.historyQueue.getJob(jobId);
          if (!job) return;

          const state = await job.getState();
          if (state === 'delayed' || state === 'waiting') {
            await job.remove();
          }
        } catch (err) {
          // A competing store can remove the same job first. BullMQ reports
          // that expected race as JobNotFoundError.
          if ((err as { name?: string })?.name !== 'JobNotFoundError') {
            throw err;
          }
        }
      }),
    );
  }

  private async syncBacklinks(
    pageId: string,
    workspaceId: string,
    tiptapJson: unknown,
  ): Promise<void> {
    const mentions = extractPageMentions(extractMentions(tiptapJson));
    const internalLinkSlugIds = extractInternalLinkSlugIds(tiptapJson);

    await this.generalQueue
      .add(QueueJob.PAGE_BACKLINKS, {
        pageId,
        workspaceId,
        mentions,
        internalLinkSlugIds,
      } as IPageBacklinkJob)
      .catch((err) => {
        this.logger.error(
          `Failed to queue backlinks for ${pageId}: ${err.message}`,
        );
      });
  }

  /**
   * Refresh `page_transclusions` and `page_transclusion_references` to match
   * the page's current content. Runs outside the page-write transaction and
   * isolates each call so a failure here cannot affect the page save itself.
   * The diff is idempotent — the next save converges if a round drops anything.
   */
  private async syncTransclusion(
    pageId: string,
    workspaceId: string,
    tiptapJson: unknown,
  ): Promise<void> {
    try {
      await this.transclusionService.syncPageTransclusions(
        pageId,
        workspaceId,
        tiptapJson,
      );
    } catch (err) {
      this.logger.error(
        { err, pageId },
        'Failed to sync transclusions for page',
      );
    }
    try {
      await this.transclusionService.syncPageReferences(
        pageId,
        workspaceId,
        tiptapJson,
      );
    } catch (err) {
      this.logger.error(
        { err, pageId },
        'Failed to sync transclusion references for page',
      );
    }
  }
}
