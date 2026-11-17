import {
  parsePagePropertyConfig,
  parsePagePropertyValue,
} from './page-property.schema';

const userId = '11111111-1111-4111-8111-111111111111';
const anotherUserId = '22222222-2222-4222-8222-222222222222';

describe('page property schemas', () => {
  it('accepts only valid ISO calendar dates', () => {
    expect(
      parsePagePropertyValue({ type: 'date', config: {} }, '2026-08-09'),
    ).toBe('2026-08-09');
    expect(() =>
      parsePagePropertyValue(
        { type: 'date', config: {} },
        '2026-08-09T14:00:00.000Z',
      ),
    ).toThrow();
    expect(() =>
      parsePagePropertyValue({ type: 'date', config: {} }, '2026-02-31'),
    ).toThrow();
  });

  it('accepts finite numbers and rejects non-finite values', () => {
    expect(parsePagePropertyValue({ type: 'number', config: {} }, 12.5)).toBe(
      12.5,
    );
    expect(() =>
      parsePagePropertyValue(
        { type: 'number', config: {} },
        Number.POSITIVE_INFINITY,
      ),
    ).toThrow();
  });

  it('uses a scalar UUID for a single-person property', () => {
    expect(parsePagePropertyValue({ type: 'person', config: {} }, userId)).toBe(
      userId,
    );
    expect(() =>
      parsePagePropertyValue({ type: 'person', config: {} }, [userId]),
    ).toThrow();
  });

  it('uses UUID arrays only when allowMultiple is enabled', () => {
    expect(
      parsePagePropertyValue(
        { type: 'person', config: { allowMultiple: true } },
        [userId, anotherUserId],
      ),
    ).toEqual([userId, anotherUserId]);
    expect(() =>
      parsePagePropertyValue(
        { type: 'person', config: { allowMultiple: true } },
        userId,
      ),
    ).toThrow();
  });

  it('treats null as deletion for every property type', () => {
    expect(
      parsePagePropertyValue({ type: 'number', config: {} }, null),
    ).toBeNull();
  });

  it('rejects unsupported config keys and defaults allowMultiple', () => {
    expect(parsePagePropertyConfig('person', {})).toEqual({
      allowMultiple: false,
    });
    expect(() =>
      parsePagePropertyConfig('date', { allowMultiple: true }),
    ).toThrow();
  });
});
