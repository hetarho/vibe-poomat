import { Controller, Get } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { registerPlugins } from '../../bootstrap'
import { EntityId } from '../../shared/kernel'
import { PresentationModule } from '../../shared/presentation/presentation.module'
import { Public } from '../../shared/presentation/public.decorator'
import { AuthenticateSessionUseCase } from '../application/authenticate-session.use-case'
import { SESSION_IDLE_LIFETIME_MS, Session } from '../domain/session'
import { SessionId } from '../domain/session-id'
import { InMemorySessionRepository } from '../test-support/in-memory-repositories'
import { SESSION_COOKIE } from './auth-cookies'
import { CurrentUser } from './current-user.decorator'
import { SessionGuard } from './session.guard'

const LIVE = SessionId.parse('a'.repeat(43))._unsafeUnwrap()
const LAPSED = SessionId.parse('b'.repeat(43))._unsafeUnwrap()
const userId = EntityId.generate()

@Controller('probe')
class ProbeController {
  @Get('guarded')
  guarded(@CurrentUser() id: string): { userId: string } {
    return { userId: id }
  }

  @Get('open')
  @Public()
  open(): { ok: true } {
    return { ok: true }
  }
}

describe('SessionGuard', () => {
  let app: NestFastifyApplication

  beforeEach(async () => {
    const sessions = new InMemorySessionRepository()
    const now = new Date()
    await sessions.save(Session.start({ id: LIVE, userId, now }))
    await sessions.save(
      Session.start({
        id: LAPSED,
        userId,
        now: new Date(now.getTime() - SESSION_IDLE_LIFETIME_MS - 1000),
      }),
    )

    const moduleRef = await Test.createTestingModule({
      imports: [PresentationModule],
      controllers: [ProbeController],
      providers: [
        { provide: AuthenticateSessionUseCase, useValue: new AuthenticateSessionUseCase(sessions) },
        {
          provide: APP_GUARD,
          inject: [Reflector, AuthenticateSessionUseCase],
          useFactory: (reflector: Reflector, authenticate: AuthenticateSessionUseCase) =>
            new SessionGuard(reflector, authenticate),
        },
      ],
    }).compile()

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await registerPlugins(app)
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })

  afterEach(async () => {
    await app.close()
  })

  async function get(url: string, cookies: Record<string, string> = {}) {
    return app.inject({ method: 'GET', url, cookies })
  }

  it('lets a live session through and names the account', async () => {
    const response = await get('/probe/guarded', { [SESSION_COOKIE]: LIVE.value })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ userId: userId.value })
  })

  it.each([
    ['no cookie at all', {}],
    ['a cookie that is not a session id', { [SESSION_COOKIE]: 'nonsense' }],
    ['an id nobody was issued', { [SESSION_COOKIE]: 'c'.repeat(43) }],
    ['a session past its expiry', { [SESSION_COOKIE]: LAPSED.value }],
  ])('refuses %s with the same 401', async (_case, cookies) => {
    const response = await get('/probe/guarded', cookies)

    expect(response.statusCode).toBe(401)
    // identical body every time: the endpoint tells an attacker nothing about
    // which of the four it was
    expect(response.json()).toEqual({ code: 'UNAUTHENTICATED', message: 'not signed in' })
  })

  it('leaves a @Public() route reachable with no cookie', async () => {
    const response = await get('/probe/open')

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })
  })
})
