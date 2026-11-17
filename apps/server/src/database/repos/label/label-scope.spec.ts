import {
  isInLabelScope,
  resolveLabelScope,
} from '@tcc-docs/db/repos/label/label-scope';

describe('label scope', () => {
  it('makes workspace labels visible in that workspace only', async () => {
    const scope = await resolveLabelScope('workspace-1', 'space-1');

    expect(
      isInLabelScope({ workspaceId: 'workspace-1', spaceId: null }, scope),
    ).toBe(true);
    expect(
      isInLabelScope({ workspaceId: 'workspace-2', spaceId: null }, scope),
    ).toBe(false);
  });

  it('makes only the current space owner visible until ancestry exists', async () => {
    const scope = await resolveLabelScope('workspace-1', 'space-1');

    expect(
      isInLabelScope({ workspaceId: 'workspace-1', spaceId: 'space-1' }, scope),
    ).toBe(true);
    expect(
      isInLabelScope({ workspaceId: 'workspace-1', spaceId: 'space-2' }, scope),
    ).toBe(false);
  });
});
