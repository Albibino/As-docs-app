import { TrashCleanupService } from './trash-cleanup.service';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

describe('TrashCleanupService', () => {
  it('uses the fixed 30-day retention even when a Workspace has a legacy setting', async () => {
    const workspaceQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest
        .fn()
        .mockResolvedValue([{ id: 'workspace-1', trashRetentionDays: 1 }]),
    };
    const deletedPagesQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue([]),
    };
    const db = {
      selectFrom: jest.fn((table: string) =>
        table === 'workspaces' ? workspaceQuery : deletedPagesQuery,
      ),
    };
    const service = new TrashCleanupService(db as never, {} as never);

    const beforeCleanup = Date.now();
    await service.cleanupOldTrash();

    const retentionDate = deletedPagesQuery.where.mock.calls.find(
      ([column]) => column === 'deletedAt',
    )?.[2] as Date;

    expect(retentionDate).toBeInstanceOf(Date);
    expect(beforeCleanup - retentionDate.getTime()).toBeGreaterThanOrEqual(
      30 * DAY_IN_MS - 1_000,
    );
    expect(beforeCleanup - retentionDate.getTime()).toBeLessThanOrEqual(
      30 * DAY_IN_MS + 1_000,
    );
  });
});
