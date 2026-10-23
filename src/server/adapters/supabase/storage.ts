import "server-only";
import type { FileStorage } from "@/server/ports";
import { createAdminClient } from "./clients";

// Private bucket (supabase/migrations/0005_storage.sql): callers store the
// returned path in the DB and mint a short-lived signed URL on read rather
// than a permanent public link.
const BUCKET = "rent-register";

export const supabaseStorage: FileStorage = {
  async upload(path, bytes, contentType) {
    const { error } = await createAdminClient().storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false });
    if (error) throw new Error(`Failed to upload ${path}: ${error.message}`);
  },

  async download(path) {
    const { data, error } = await createAdminClient().storage.from(BUCKET).download(path);
    if (error || !data) throw new Error(`Failed to download ${path}: ${error?.message}`);
    return new Uint8Array(await data.arrayBuffer());
  },

  async signedUrl(path, expiresInSeconds) {
    const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
    if (error || !data) throw new Error(`Failed to sign URL for ${path}: ${error?.message}`);
    return data.signedUrl;
  },

  async remove(paths) {
    if (paths.length === 0) return;
    const { error } = await createAdminClient().storage.from(BUCKET).remove(paths);
    if (error) console.error(`Failed to remove ${paths.join(", ")}: ${error.message}`);
  },
};
