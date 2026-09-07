import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module'
import { configureApp } from './bootstrap'
import { ENV, type Env } from './shared/config/env.token'
import { requestIdFastifyOptions } from './shared/logging/request-id'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(requestIdFastifyOptions),
    {
      // buffer until nestjs-pino is available, so boot logs use the same format
      bufferLogs: true,
    },
  )
  app.useLogger(app.get(Logger))

  const config = app.get<Env>(ENV)
  configureApp(app, config)

  await app.listen({ port: config.API_PORT, host: '0.0.0.0' })
}

void bootstrap()
