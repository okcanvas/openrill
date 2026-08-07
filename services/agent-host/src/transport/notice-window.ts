import type { NoticeFrame } from "@openrill/protocol";

export interface NoticeReplay {
  readonly resyncRequired: boolean;
  readonly cursor: number;
  readonly notices: readonly NoticeFrame[];
}

export class NoticeWindow {
  private sequence = 0;
  private readonly retained: NoticeFrame[] = [];
  constructor(private readonly capacity = 128, private readonly now: () => number = Date.now) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 4096) throw new Error("invalid notice window capacity");
  }
  get cursor(): number { return this.sequence; }
  publish(topic: string, data: unknown): NoticeFrame {
    const notice: NoticeFrame = { type: "notice", topic, sequence: ++this.sequence, emittedAt: new Date(this.now()).toISOString(), data };
    this.retained.push(notice);
    while (this.retained.length > this.capacity) this.retained.shift();
    return notice;
  }
  replayAfter(cursor: number | undefined): NoticeReplay {
    if (cursor === undefined) return { resyncRequired: false, cursor: this.sequence, notices: [] };
    const oldest = this.retained[0]?.sequence ?? this.sequence + 1;
    if (cursor > this.sequence || cursor < oldest - 1) return { resyncRequired: true, cursor: this.sequence, notices: [] };
    return { resyncRequired: false, cursor, notices: this.retained.filter((notice) => notice.sequence > cursor) };
  }
}
