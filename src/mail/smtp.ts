/**
 * SMTP sending via nodemailer (Privatemail). The MIME message is composed ONCE
 * — with the Message-ID we control — so the exact same bytes are both sent over
 * SMTP and APPENDed to the Sent folder over IMAP. That makes the sent copy a
 * faithful record and keeps reply-matching reliable.
 */
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { loadEnv } from "../config/env";
import { listUnsubscribe } from "./headers";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  /** Optional simple HTML fallback; keep it plain-looking (SKILLS.md §3). */
  html?: string;
  /** Message-ID we generated and will store for reply matching. */
  messageId: string;
  /** Threading headers for a follow-up (references the original). */
  inReplyTo?: string;
  references?: string;
}

let sendTransport: Transporter | null = null;

function transporter(): Transporter {
  if (sendTransport) return sendTransport;
  const env = loadEnv();
  sendTransport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return sendTransport;
}

/** Build the nodemailer message object with proper headers. */
function buildMessage(email: OutgoingEmail) {
  const env = loadEnv();
  const headers: Record<string, string> = {
    "List-Unsubscribe": listUnsubscribe(env.SENDER_EMAIL, env.UNSUBSCRIBE_URL),
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
  if (email.inReplyTo) headers["In-Reply-To"] = email.inReplyTo;
  if (email.references) headers["References"] = email.references;

  return {
    from: { name: env.SENDER_NAME, address: env.SENDER_EMAIL },
    to: email.to,
    replyTo: env.REPLY_TO_EMAIL ?? env.SENDER_EMAIL,
    subject: email.subject,
    text: email.text,
    ...(email.html ? { html: email.html } : {}),
    messageId: email.messageId,
    headers,
  };
}

/** Compose the raw MIME bytes once (no network). */
export async function composeRaw(email: OutgoingEmail): Promise<Buffer> {
  const composer = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "crlf",
  });
  const info = await composer.sendMail(buildMessage(email));
  return info.message as Buffer;
}

/** Verify SMTP credentials/connection (used by `doctor`). */
export async function verifySmtp(): Promise<void> {
  await transporter().verify();
}

/**
 * Send pre-composed raw bytes over SMTP. Returns the same bytes so the caller
 * can APPEND them to Sent, guaranteeing an identical copy.
 */
export async function sendRaw(to: string, raw: Buffer): Promise<Buffer> {
  const env = loadEnv();
  await transporter().sendMail({
    envelope: { from: env.SENDER_EMAIL, to },
    raw,
  });
  return raw;
}

/** Test seam. */
export function resetTransport(): void {
  sendTransport = null;
}
