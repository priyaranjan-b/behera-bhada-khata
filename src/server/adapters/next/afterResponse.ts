import "server-only";
import { after } from "next/server";
import type { AfterResponse } from "@/server/ports";

// Background work after the response (A32), through Next's after(): on
// Vercel the function stays alive until it finishes.
export const nextAfterResponse: AfterResponse = {
  run(task) {
    after(task);
  },
};
