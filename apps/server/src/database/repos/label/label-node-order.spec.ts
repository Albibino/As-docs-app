import { reorderSiblingIds } from './label-node-order';

const siblings = [
  { id: 'a', position: 0, name: 'A' },
  { id: 'b', position: 1, name: 'B' },
  { id: 'c', position: 2, name: 'C' },
];

describe('reorderSiblingIds', () => {
  it('moves a sibling upward without colliding with the existing positions', () => {
    expect(reorderSiblingIds(siblings, 'c', 0)).toEqual(['c', 'a', 'b']);
  });

  it('moves a sibling downward without colliding with the existing positions', () => {
    expect(reorderSiblingIds(siblings, 'a', 2)).toEqual(['b', 'c', 'a']);
  });

  it('clamps positions to the available sibling range', () => {
    expect(reorderSiblingIds(siblings, 'b', 99)).toEqual(['a', 'c', 'b']);
  });
});
