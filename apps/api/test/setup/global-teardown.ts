export default async function globalTeardown(): Promise<void> {
  await Promise.all([globalThis.__SRM_POSTGRES__?.stop(), globalThis.__SRM_REDIS__?.stop()]);
  globalThis.__SRM_POSTGRES__ = undefined;
  globalThis.__SRM_REDIS__ = undefined;
}
