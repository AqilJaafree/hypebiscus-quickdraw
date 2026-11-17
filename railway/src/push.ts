import { sendNotification, WebPushError } from "web-push";
import type { SendPush } from "./engine.js";

export interface VapidConfig { publicKey: string; privateKey: string; subject: string }

export function webPushSender(vapid: VapidConfig): SendPush {
  return async (sub, msg) => {
    try {
      await sendNotification(sub, JSON.stringify(msg), {
        vapidDetails: vapid,
        TTL: 60 * 60,      // an alert older than an hour is stale
        urgency: "high",
      });
      return "sent";
    } catch (e) {
      // 404/410: the browser dropped this subscription; stop sending to it.
      if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) return "gone";
      console.error("push failed:", e instanceof WebPushError ? `${e.statusCode} ${e.body}` : e);
      return "failed";
    }
  };
}
