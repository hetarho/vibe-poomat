import 'reflect-metadata'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { cleanupOpenApiDoc } from 'nestjs-zod'
import { AppModule } from './app.module'
import { GLOBAL_PREFIX, PREFIX_EXCLUDED_ROUTES } from './bootstrap'

/**
 * Builds the OpenAPI document from a Nest app that is created but never listens,
 * so the contract can be regenerated without a server or a database.
 */
const OUTPUT_PATH = resolve(process.cwd(), '../../packages/api-client/openapi.json')

async function generate(): Promise<void> {
  // preview mode builds the module graph and registers routes without running
  // any provider's lifecycle, so no database or queue has to be reachable
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
    preview: true,
  })
  app.setGlobalPrefix(GLOBAL_PREFIX, { exclude: PREFIX_EXCLUDED_ROUTES })
  await app.init()

  const config = new DocumentBuilder()
    .setTitle('vibe-poomat API')
    .setDescription('Feedback exchange for vibe-coded side projects')
    .setVersion('1')
    .setOpenAPIVersion('3.1.0')
    // a relative server keeps the document identical across environments
    .addServer('/')
    .build()

  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config), {
    version: '3.1',
  })

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(document, null, 2)}\n`)

  await app.close()
}

void generate()
