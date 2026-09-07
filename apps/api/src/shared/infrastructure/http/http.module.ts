import { Global, Module } from '@nestjs/common'
import { HTTP_PROBE } from '../../application'
import { UndiciHttpProbe } from './undici-http-probe'

@Global()
@Module({
  providers: [{ provide: HTTP_PROBE, useFactory: () => new UndiciHttpProbe() }],
  exports: [HTTP_PROBE],
})
export class HttpModule {}
