import { describe, it, expect } from "vitest";
import {
  buildSentIndex,
  matchReplies,
  normalizeMsgId,
  type IncomingMessage,
  type SentRef,
} from "../src/mail/reply-match";

const refs: SentRef[] = [
  { category: "profs", email: "a@x.com", row: 2, messageId: "<m1@jrc.org>" },
  { category: "sponsors", email: "b@y.com", row: 3, messageId: "<m2@jrc.org>" },
];

function incoming(p: Partial<IncomingMessage>): IncomingMessage {
  return {
    from: "someone@elsewhere.com",
    subject: "Re: hi",
    date: "2026-07-14T00:00:00Z",
    inReplyTo: [],
    references: [],
    messageId: "<in@elsewhere.com>",
    ...p,
  };
}

describe("normalizeMsgId", () => {
  it("strips brackets, trims, lowercases", () => {
    expect(normalizeMsgId("  <M1@JRC.org> ")).toBe("m1@jrc.org");
  });
});

describe("matchReplies", () => {
  const index = buildSentIndex(refs);

  it("matches via In-Reply-To", () => {
    const { matches } = matchReplies(index, [incoming({ inReplyTo: ["<m1@jrc.org>"] })]);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.ref.email).toBe("a@x.com");
  });

  it("matches via References when In-Reply-To is absent", () => {
    const { matches } = matchReplies(index, [
      incoming({ references: ["<other@z.com>", "<m2@jrc.org>"] }),
    ]);
    expect(matches[0]!.ref.email).toBe("b@y.com");
  });

  it("does NOT match on subject/keyword alone", () => {
    const { matches, unmatched } = matchReplies(index, [
      incoming({ subject: "Re: A quick ask", from: "a@x.com" }),
    ]);
    expect(matches).toHaveLength(0);
    expect(unmatched).toHaveLength(1);
  });

  it("claims each sent row at most once", () => {
    const { matches } = matchReplies(index, [
      incoming({ inReplyTo: ["<m1@jrc.org>"] }),
      incoming({ inReplyTo: ["<m1@jrc.org>"] }),
    ]);
    expect(matches).toHaveLength(1);
  });

  it("reports unmatched mail", () => {
    const { unmatched } = matchReplies(index, [incoming({})]);
    expect(unmatched).toHaveLength(1);
  });
});
