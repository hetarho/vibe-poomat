import { Global, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { PgThrottlerStorage } from './pg-throttler-storage'
import { throttlerPolicy, trackerFor } from './throttler-policy'

/**
 * ThrottlerModule resolves its factory in its own injector, so the storage has
 * to arrive through an imported module rather than a sibling provider.
 */
@Module({
  providers: [PgThrottlerStorage],
  exports: [PgThrottlerStorage],
})
class ThrottlerStorageModule {}

@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ThrottlerStorageModule],
      inject: [PgThrottlerStorage],
      useFactory: (storage: PgThrottlerStorage) => ({
        throttlers: throttlerPolicy,
        storage,
        getTracker: (request) => trackerFor(request as Parameters<typeof trackerFor>[0]),
      }),
    }),
  ],
  // every route is throttled; a mutating route opts into the strict bucket
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class ThrottlingModule {}
