import {
  getCollaborationResource,
  getPageId,
} from './collaboration.util';

describe('collaboration document names', () => {
  it.each([
    ['page.page-1', { type: 'page', id: 'page-1' }],
  ])('parses %s', (documentName, expected) => {
    expect(getCollaborationResource(documentName)).toEqual(expected);
  });

  it('keeps page id compatibility for page documents', () => {
    expect(getPageId('page.page-1')).toBe('page-1');
  });

  // Modelos de página foram removidos no TCC: "template.*" não é mais documento.
  it.each(['page', 'comment.comment-1', 'template.', 'template.template-1'])('rejects %s', (name) => {
    expect(() => getCollaborationResource(name)).toThrow(
      'Invalid collaboration document name',
    );
  });
});
