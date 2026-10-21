import webpush from "web-push";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";

let configured = false;

function ensureConfigured(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:admin@example.com",
      pub,
      priv,
    );
    configured = true;
  }
  return true;
}

export type PushResult = { sent: number; gone: number; failed: number };

/** Sends tonight's reminder to every subscription in the list. */
export async function sendReminders(
  subs: { id: string; endpoint: string; p256dh: string; auth: string }[],
): Promise<PushResult> {
  const result: PushResult = { sent: 0, gone: 0, failed: 0 };
  if (!ensureConfigured() || subs.length === 0) return result;

  const payload = JSON.stringify({
    title: "Nightly Check-In",
    body: "Tonight's check-in is open until midnight.",
    url: "/checkin",
  });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 60 * 60 * 2 },
        );
        result.sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          result.gone++;
          await db().delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        } else {
          result.failed++;
        }
      }
    }),
  );
  return result;
}
