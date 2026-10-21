import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "rent-register";

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  return new Uint8Array(Buffer.from(base64, "base64"));
}

// Bucket is private - callers store the returned path in the DB and mint a
// signed URL on read (getSignedUrl) rather than a permanent public link.
export async function uploadPrivateFile(
  path: string,
  bytes: Uint8Array,
  contentType: string
): Promise<string> {
  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(`Failed to upload ${path}: ${error.message}`);
  return path;
}

export async function getSignedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw new Error(`Failed to sign URL for ${path}: ${error?.message}`);
  return data.signedUrl;
}
