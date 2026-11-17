/** Parser incremental de Server-Sent Events (`event:` + `data:`). */
export class SseParser {
  private buffer = '';

  push(chunk: string): Array<{ event: string; data: string }> {
    this.buffer += chunk;
    const events: Array<{ event: string; data: string }> = [];
    let boundary = this.buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const block = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        const clean = line.replace(/\r$/, '');
        if (clean.startsWith('event:')) event = clean.slice(6).trim();
        else if (clean.startsWith('data:')) data.push(clean.slice(5).trimStart());
      }
      if (data.length) events.push({ event, data: data.join('\n') });
      boundary = this.buffer.indexOf('\n\n');
    }
    return events;
  }
}
