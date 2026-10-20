export default async function globalTeardown(): Promise<void> {
  await Promise.all([
    globalThis.__SRM_POSTGRES__?.stop(),
    globalThis.__SRM_REDIS__?.stop(),
    globalThis.__SRM_MINIO__?.stop(),
    globalThis.__SRM_RABBITMQ__?.stop(),
  ]);
  // After the containers: a network with containers attached cannot be removed.
  await globalThis.__SRM_NETWORK__?.stop();
  globalThis.__SRM_POSTGRES__ = undefined;
  globalThis.__SRM_REDIS__ = undefined;
  globalThis.__SRM_MINIO__ = undefined;
  globalThis.__SRM_RABBITMQ__ = undefined;
  globalThis.__SRM_NETWORK__ = undefined;
}
