/**
 * Leitor incremental de Server-Sent Events.
 *
 * Recebe pedaços de texto (que podem cortar uma linha ao meio) e devolve o
 * campo `data` de cada evento completo. Eventos são separados por uma linha em
 * branco; várias linhas `data:` do mesmo evento são unidas por "\n".
 * Aceita \n, \r\n e \r como fim de linha e ignora comentários (": ...").
 */
export class SseParser {
  private buffer = "";
  private dataLines: string[] = [];

  /** Alimenta o parser e devolve os `data` dos eventos concluídos. */
  push(chunk: string): string[] {
    this.buffer += chunk;
    const out: string[] = [];
    // Um "\r" no fim do buffer pode ser metade de um "\r\n": espera o próximo pedaço.
    const text = this.buffer.endsWith("\r")
      ? this.buffer.slice(0, -1)
      : this.buffer;
    const rest = this.buffer.slice(text.length);
    const lines = text.split(/\r\n|\n|\r/);
    this.buffer = lines.pop() + rest;
    for (const line of lines) this.consumeLine(line, out);
    return out;
  }

  /** Fim do fluxo: descarrega a última linha e o evento sem linha em branco final. */
  flush(): string[] {
    const out: string[] = [];
    if (this.buffer) this.consumeLine(this.buffer.replace(/\r$/, ""), out);
    this.buffer = "";
    this.dispatch(out);
    return out;
  }

  private consumeLine(line: string, out: string[]) {
    if (line === "") {
      this.dispatch(out);
    } else if (line.startsWith(":")) {
      // comentário/keep-alive
    } else if (line.startsWith("data:")) {
      const value = line.slice(5);
      this.dataLines.push(value.startsWith(" ") ? value.slice(1) : value);
    }
    // `event:`, `id:` e `retry:` não são usados por este contrato.
  }

  private dispatch(out: string[]) {
    if (this.dataLines.length) {
      out.push(this.dataLines.join("\n"));
      this.dataLines = [];
    }
  }
}
