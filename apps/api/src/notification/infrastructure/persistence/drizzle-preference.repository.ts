import { Injectable } from '@nestjs/common'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '../../../shared/db'
import { isNotificationType, type NotificationType } from '../../domain/notification-type'
import type { PreferenceRepository } from '../../domain/preference.repository'
import { notificationPrefs } from './schema'

@Injectable()
export class DrizzlePreferenceRepository implements PreferenceRepository {
  async settingsFor(userId: string): Promise<Map<NotificationType, boolean>> {
    const rows = await getDb()
      .select()
      .from(notificationPrefs)
      .where(eq(notificationPrefs.userId, userId))

    const settings = new Map<NotificationType, boolean>()
    for (const row of rows) {
      // a type this build no longer knows about is simply not a setting any more
      if (isNotificationType(row.type)) settings.set(row.type, row.enabled)
    }

    return settings
  }

  /** Created lazily on the first change, which is why this is an upsert. */
  async set(userId: string, type: NotificationType, enabled: boolean): Promise<void> {
    await getDb()
      .insert(notificationPrefs)
      .values({ userId, type, enabled })
      .onConflictDoUpdate({
        target: [notificationPrefs.userId, notificationPrefs.type],
        set: { enabled, updatedAt: sql`now()` },
      })
  }
}
