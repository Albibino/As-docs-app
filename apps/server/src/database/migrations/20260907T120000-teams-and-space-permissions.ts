import { type Kysely, sql } from 'kysely';
import {
  assertValidTeamSpaceMigrationPlan,
  normalizeTeamName,
  readTeamSpaceMigrationPlan,
} from '../team-space-name-convention';

export function createdTeamKey(team: {
  workspaceId?: string;
  workspace_id?: string;
  name: string;
}): string {
  const workspaceId = team.workspaceId ?? team.workspace_id;
  if (!workspaceId) {
    throw new Error(`Created team ${team.name} has no workspace id`);
  }
  return `${workspaceId}:${normalizeTeamName(team.name)}`;
}

export async function up(db: Kysely<any>): Promise<void> {
  // Kysely's Migrator already calls each migration inside a transaction when
  // the dialect supports transactional DDL. Starting one here would nest it.
  await db.schema
    .createTable('teams')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('creator_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('teams_workspace_name_unique', [
      'workspace_id',
      'name',
    ])
    .execute();

  await db.schema
    .createIndex('teams_workspace_id_idx')
    .on('teams')
    .column('workspace_id')
    .execute();

  await db.schema
    .createTable('team_members')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('team_id', 'uuid', (col) =>
      col.notNull().references('teams.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('role', 'varchar', (col) => col.notNull())
    .addColumn('added_by_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('team_members_team_user_unique', [
      'team_id',
      'user_id',
    ])
    .addCheckConstraint(
      'team_members_role_check',
      sql`role IN ('admin', 'member')`,
    )
    .execute();

  await db.schema
    .createIndex('team_members_user_id_idx')
    .on('team_members')
    .column('user_id')
    .execute();

  await db.schema
    .createTable('space_permissions')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.notNull().references('spaces.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('can_view', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('can_create', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('can_edit', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('can_delete', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('granted_by_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('space_permissions_space_user_unique', [
      'space_id',
      'user_id',
    ])
    .addCheckConstraint(
      'space_permissions_view_dependency_check',
      sql`can_view OR (NOT can_create AND NOT can_edit AND NOT can_delete)`,
    )
    .execute();

  await db.schema
    .createIndex('space_permissions_user_id_idx')
    .on('space_permissions')
    .column('user_id')
    .execute();

  await db.schema
    .alterTable('spaces')
    .addColumn('team_id', 'uuid', (col) =>
      col.references('teams.id').onDelete('restrict'),
    )
    .addColumn('archived_at', 'timestamptz')
    .addColumn('archived_by_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .execute();

  await db.schema
    .createIndex('spaces_team_id_idx')
    .on('spaces')
    .column('team_id')
    .execute();

  const plan = await readTeamSpaceMigrationPlan(db);
  assertValidTeamSpaceMigrationPlan(plan);

  const createdTeams = plan.teams.length
    ? await db
        .insertInto('teams')
        .values(
          plan.teams.map((team) => ({
            workspace_id: team.workspaceId,
            name: team.name,
            creator_id: team.creatorId,
          })),
        )
        .returning(['id', 'workspace_id', 'name'])
        .execute()
    : [];
  const teamIds = new Map(
    createdTeams.map((team) => [createdTeamKey(team), team.id]),
  );

  for (const team of plan.teams) {
    if (!teamIds.has(team.key)) {
      throw new Error(`Failed to create team ${team.name}`);
    }
  }

  for (const space of plan.spaces) {
    const teamId = teamIds.get(space.teamKey);
    if (!teamId) {
      throw new Error(`Could not resolve team for space ${space.id}`);
    }
    await db
      .updateTable('spaces')
      .set({ team_id: teamId, name: space.name })
      .where('id', '=', space.id)
      .execute();
  }

  if (plan.members.length) {
    await db
      .insertInto('team_members')
      .values(
        plan.members.map((member) => ({
          team_id: teamIds.get(member.teamKey)!,
          user_id: member.userId,
          role: member.role,
          added_by_id: member.addedById,
        })),
      )
      .execute();
  }

  if (plan.permissions.length) {
    await db
      .insertInto('space_permissions')
      .values(
        plan.permissions.map((permission) => ({
          space_id: permission.spaceId,
          user_id: permission.userId,
          can_view: permission.canView,
          can_create: permission.canCreate,
          can_edit: permission.canEdit,
          can_delete: permission.canDelete,
          granted_by_id: permission.grantedById,
        })),
      )
      .execute();
  }

  await sql`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM teams t
          WHERE NOT EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.team_id = t.id AND tm.role = 'admin'
          )
        ) THEN
          RAISE EXCEPTION 'Every migrated team must have at least one admin';
        END IF;

        IF EXISTS (SELECT 1 FROM spaces WHERE team_id IS NULL) THEN
          RAISE EXCEPTION 'Every migrated space must belong to a team';
        END IF;
      END $$;
    `.execute(db);

  await db.schema
    .alterTable('spaces')
    .alterColumn('team_id', (col) => col.setNotNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('spaces_team_id_idx').ifExists().execute();
  await db.schema
    .alterTable('spaces')
    .dropColumn('archived_by_id')
    .dropColumn('archived_at')
    .dropColumn('team_id')
    .execute();
  await db.schema
    .dropIndex('space_permissions_user_id_idx')
    .ifExists()
    .execute();
  await db.schema.dropIndex('team_members_user_id_idx').ifExists().execute();
  await db.schema.dropIndex('teams_workspace_id_idx').ifExists().execute();
  await db.schema.dropTable('space_permissions').ifExists().execute();
  await db.schema.dropTable('team_members').ifExists().execute();
  await db.schema.dropTable('teams').ifExists().execute();
}
