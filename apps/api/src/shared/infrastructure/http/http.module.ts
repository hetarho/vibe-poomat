import { Global, Module } from '@nestjs/common'
import { HTTP_PROBE } from '../../application'
import { ENV, type Env } from '../../config/env.token'
import { LoopbackHttpProbe } from './loopback-http-probe'
import { UndiciHttpProbe } from './undici-http-probe'

/**
 * Which probe answers a user-supplied URL, decided by env in one place (the
 * ARCH-36 pattern). `test` gets the fixture probe so a browser suite need not
 * reach the public internet; everything else gets the real, SSRF-guarded one.
 */
function probeFor(config: Env): UndiciHttpProbe | LoopbackHttpProbe {
  return config.NODE_ENV === 'test' ? new LoopbackHttpProbe() : new UndiciHttpProbe()
}

@Global()
@Module({
  providers: [{ provide: HTTP_PROBE, inject: [ENV], useFactory: probeFor }],
  exports: [HTTP_PROBE],
})
export class HttpModule {}
