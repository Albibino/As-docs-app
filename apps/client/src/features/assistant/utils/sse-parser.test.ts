import { describe, expect, it } from "vitest";
import { SseParser } from "./sse-parser";

describe("SseParser", () => {
  it("devolve o data de cada evento separado por linha em branco", () => {
    const parser = new SseParser();
    expect(parser.push('data: {"a":1}\n\ndata: {"b":2}\n\n')).toEqual([
      '{"a":1}',
      '{"b":2}',
    ]);
  });

  it("junta pedaços que cortam o evento no meio da linha", () => {
    const parser = new SseParser();
    expect(parser.push('data: {"type":"con')).toEqual([]);
    expect(parser.push('tent","text":"oi"}\n')).toEqual([]);
    expect(parser.push("\n")).toEqual(['{"type":"content","text":"oi"}']);
  });

  it("aceita \\r\\n, inclusive quando o \\r e o \\n chegam separados", () => {
    const parser = new SseParser();
    expect(parser.push("data: um\r")).toEqual([]);
    expect(parser.push("\n\r\ndata: dois\r\n\r\n")).toEqual(["um", "dois"]);
  });

  it("une várias linhas data e ignora comentários e outros campos", () => {
    const parser = new SseParser();
    expect(
      parser.push(": keep-alive\nevent: x\nid: 7\ndata: a\ndata: b\n\n"),
    ).toEqual(["a\nb"]);
  });

  it("descarrega o último evento quando o fluxo acaba sem linha em branco", () => {
    const parser = new SseParser();
    expect(parser.push('data: {"type":"done"}')).toEqual([]);
    expect(parser.flush()).toEqual(['{"type":"done"}']);
    expect(parser.flush()).toEqual([]);
  });
});
