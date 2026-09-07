import { Global, Module } from '@nestjs/common'
import { env } from '@repo/config'
import { ENV } from './env.token'

@Global()
@Module({
  providers: [{ provide: ENV, useValue: env }],
  exports: [ENV],
})
export class ConfigModule {}
