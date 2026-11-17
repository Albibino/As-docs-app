import { bucketLabelFilterIds } from './search.service';

describe('search label filtering', () => {
  it('ORs nodes in one tree and ANDs tree/free-tag buckets', () => {
    expect(
      bucketLabelFilterIds([
        { id: 'todo', treeId: 'status' },
        { id: 'done', treeId: 'status' },
        { id: 'urgent', treeId: null },
        { id: 'customer', treeId: 'audience' },
      ]),
    ).toEqual([['todo', 'done'], ['urgent'], ['customer']]);
  });

  it('keeps each free tag in its own required bucket', () => {
    expect(
      bucketLabelFilterIds([
        { id: 'urgent', treeId: null },
        { id: 'security', treeId: null },
      ]),
    ).toEqual([['urgent'], ['security']]);
  });
});
