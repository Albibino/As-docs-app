import { ForbiddenException } from '@nestjs/common';
import { SearchController } from './search.controller';

const user = { id: 'user-1' } as any;
const workspace = { id: 'workspace-1' } as any;

describe('SearchController', () => {
  function createController(canReadSpace = true) {
    const searchService = {
      searchPage: jest.fn().mockResolvedValue({ items: [] }),
      searchSuggestions: jest.fn(),
    };
    const spaceAbility = {
      createForUser: jest.fn().mockResolvedValue({
        cannot: jest.fn().mockReturnValue(!canReadSpace),
      }),
    };
    return {
      controller: new SearchController(
        searchService as any,
        spaceAbility as any,
      ),
      searchService,
      spaceAbility,
    };
  }

  it('searches pages in SQL with the label filters from the request', async () => {
    const { controller, searchService } = createController();
    const dto = {
      query: 'roadmap',
      labelIds: ['11111111-1111-4111-8111-111111111111'],
    } as any;

    await controller.pageSearch(dto, user, workspace);

    expect(searchService.searchPage).toHaveBeenCalledWith(dto, {
      userId: user.id,
      workspaceId: workspace.id,
    });
  });

  it('refuses a space search when the user cannot read its pages', async () => {
    const { controller, searchService } = createController(false);
    const dto = { query: 'roadmap', spaceId: 'space-1' } as any;

    await expect(controller.pageSearch(dto, user, workspace)).rejects.toThrow(
      ForbiddenException,
    );
    expect(searchService.searchPage).not.toHaveBeenCalled();
  });
});
