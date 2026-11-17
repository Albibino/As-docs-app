import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Kysely, PostgresDialect } from 'kysely';
import {
  createdTeamKey,
  up,
} from './migrations/20260907T120000-teams-and-space-permissions';

const migrationPath = join(
  __dirname,
  'migrations',
  '20260907T120000-teams-and-space-permissions.ts',
);

function normalizeSql(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function createRecordingDatabase() {
  const queries: string[] = [];
  const client = {
    query: jest.fn(async (query: string) => {
      queries.push(normalizeSql(query));
      return { command: '', rowCount: 0, rows: [] };
    }),
    release: jest.fn(),
  };
  const pool = {
    connect: jest.fn(async () => client),
    end: jest.fn(async () => undefined),
  };
  const db = new Kysely<any>({
    dialect: new PostgresDialect({ pool: pool as never }),
  });

  return { db, queries };
}

describe('teams and space permissions migration', () => {
  it('installs the team ACL schema and validates the name convention before enforcing a team', async () => {
    expect(existsSync(migrationPath)).toBe(true);

    const { db, queries } = createRecordingDatabase();
    const transaction = jest.spyOn(db, 'transaction');

    await up(db);
    await db.destroy();

    const sql = queries.join(' ');
    expect(sql).toContain('create table "teams"');
    expect(sql).toContain('default gen_uuid_v7()');
    expect(sql).toContain('references "workspaces" ("id") on delete cascade');
    expect(sql).toContain('create table "team_members"');
    expect(sql).toContain("check (role in ('admin', 'member'))");
    expect(sql).toContain('unique ("team_id", "user_id")');
    expect(sql).toContain('create table "space_permissions"');
    expect(sql).toContain('"can_view" boolean default false not null');
    expect(sql).toContain('"can_create" boolean default false not null');
    expect(sql).toContain('"can_edit" boolean default false not null');
    expect(sql).toContain('"can_delete" boolean default false not null');
    expect(sql).toContain(
      'check (can_view or (not can_create and not can_edit and not can_delete))',
    );
    expect(sql).toContain('create index "teams_workspace_id_idx"');
    expect(sql).toContain('create index "team_members_user_id_idx"');
    expect(sql).toContain('create index "space_permissions_user_id_idx"');
    expect(sql).toContain('create index "spaces_team_id_idx"');
    expect(sql).toContain('every migrated team must have at least one admin');
    expect(sql).toContain('every migrated space must belong to a team');

    const enforceTeam = queries.findIndex((query) =>
      query.includes('alter column "team_id" set not null'),
    );

    expect(sql).toContain('from spaces');
    expect(sql).toContain('from space_members sm');
    expect(sql).toContain('join groups g');
    expect(sql).toContain('join group_users gu');
    expect(sql).toContain('\'group\' as "source"');
    expect(sql).toContain('g.deleted_at is null');
    expect(sql).not.toContain('external_orphaned_at is null');
    expect(transaction).not.toHaveBeenCalled();
    expect(readFileSync(migrationPath, 'utf8')).toContain(
      'assertValidTeamSpaceMigrationPlan',
    );
    expect(enforceTeam).toBeGreaterThan(-1);
    expect(sql).toContain('u.deactivated_at is null');
    expect(sql).toContain('u.deleted_at is null');
    expect(sql).not.toContain('label_groups');
    expect(sql).not.toContain('label_trees');
    expect(sql).not.toContain('page_permissions');
  });

  it('maps returned Teams from the application and CLI Kysely configurations', () => {
    expect(createdTeamKey({ workspaceId: 'workspace-1', name: 'Dév' })).toBe(
      'workspace-1:dev',
    );
    expect(createdTeamKey({ workspace_id: 'workspace-2', name: 'Dev' })).toBe(
      'workspace-2:dev',
    );
  });
});
