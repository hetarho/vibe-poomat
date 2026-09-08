import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { getDb } from '../../../shared/db'
import type { Session } from '../../domain/session'
import type { SessionRepository } from '../../domain/session.repository'
import type { SessionId } from '../../domain/session-id'
import { fromSession, toSession } from './row-mapper'
import { sessions } from './schema'

@Injectable()
export class DrizzleSessionRepository implements SessionRepository {
  async findById(id: SessionId): Promise<Session | null> {
    const rows = await getDb().select().from(sessions).where(eq(sessions.id, id.value)).limit(1)
    const row = rows[0]

    return row === undefined ? null : toSession(row)
  }

  /**
   * Upsert rather than insert: `touch` slides the same row's window, and issuing
   * a session is the only path that creates one. The id is 256 bits of entropy,
   * so a conflict here is always the former.
   */
  async save(session: Session): Promise<void> {
    const row = fromSession(session)

    await getDb()
      .insert(sessions)
      .values(row)
      .onConflictDoUpdate({
        target: sessions.id,
        set: { lastSeenAt: row.lastSeenAt, expiresAt: row.expiresAt },
      })
  }

  async delete(id: SessionId): Promise<void> {
    await getDb().delete(sessions).where(eq(sessions.id, id.value))
  }
}
