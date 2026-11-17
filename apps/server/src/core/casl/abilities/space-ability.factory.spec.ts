import { NotFoundException } from '@nestjs/common';
import SpaceAbilityFactory from './space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../interfaces/space-ability.type';

describe('SpaceAbilityFactory', () => {
  const user = { id: 'user-id' } as never;

  it('maps explicit view, create and edit flags without administration', async () => {
    const authorization = {
      resolve: jest.fn().mockResolvedValue({
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: false,
        source: 'explicit',
      }),
    };
    const factory = new SpaceAbilityFactory(authorization as never);

    const ability = await factory.createForUser(user, 'space-id');

    expect(ability.can(SpaceCaslAction.Read, SpaceCaslSubject.Page)).toBe(true);
    expect(ability.can(SpaceCaslAction.Create, SpaceCaslSubject.Page)).toBe(
      true,
    );
    expect(ability.can(SpaceCaslAction.Edit, SpaceCaslSubject.Page)).toBe(
      true,
    );
    expect(ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)).toBe(
      false,
    );
  });

  it('allows inherited admins to manage space settings and members', async () => {
    const authorization = {
      resolve: jest.fn().mockResolvedValue({
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
        source: 'team-admin',
      }),
    };
    const factory = new SpaceAbilityFactory(authorization as never);

    const ability = await factory.createForUser(user, 'space-id');

    expect(
      ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings),
    ).toBe(true);
    expect(ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Member)).toBe(
      true,
    );
    expect(ability.can(SpaceCaslAction.Edit, SpaceCaslSubject.Page)).toBe(
      true,
    );
    expect(ability.can(SpaceCaslAction.Delete, SpaceCaslSubject.Page)).toBe(
      true,
    );
  });

  it('hides spaces with no resolved permission', async () => {
    const factory = new SpaceAbilityFactory({
      resolve: jest.fn().mockResolvedValue(null),
    } as never);

    await expect(factory.createForUser(user, 'space-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
