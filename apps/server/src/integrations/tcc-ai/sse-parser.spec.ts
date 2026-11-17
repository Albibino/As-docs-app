import { SseParser } from './sse-parser';

describe('SseParser', () => {
  it('parses events split across network chunks', () => {
    const parser = new SseParser();
    expect(parser.push('event: delta\ndata: {"te')).toEqual([]);
    expect(parser.push('xt":"a"}\n\nevent: done\r\ndata: {}\r\n\n')).toEqual([
      { event: 'delta', data: '{"text":"a"}' },
      { event: 'done', data: '{}' },
    ]);
  });
});
