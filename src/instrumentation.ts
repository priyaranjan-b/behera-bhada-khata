// Runs once when a server instance starts: fail fast on a bad environment
// instead of on the first request that happens to need the missing variable.
export async function register() {
  const { validateEnvAtStartup } = await import("@/server/env");
  validateEnvAtStartup();
}
