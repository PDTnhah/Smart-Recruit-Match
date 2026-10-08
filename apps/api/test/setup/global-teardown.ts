export default async function globalTeardown(): Promise<void> {
  await globalThis.__SRM_POSTGRES__?.stop();
  globalThis.__SRM_POSTGRES__ = undefined;
}
