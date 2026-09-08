import { Injectable } from '@nestjs/common'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { SlotOccupancy } from '../../../shared/application'
import { NO_OCCUPANCY } from '../../../shared/application'
import { getDb } from '../../../shared/db'
import { EntityId } from '../../../shared/kernel'
import type { ClaimRepository } from '../../domain/claim.repository'
import { type ClaimState, FeedbackClaim, LIVE_CLAIM_STATES } from '../../domain/feedback-claim'
import { feedbackClaims } from './schema'

type Row = typeof feedbackClaims.$inferSelect

function toClaim(row: Row): FeedbackClaim {
  return FeedbackClaim.restore(EntityId.parse(row.id)._unsafeUnwrap(), {
    missionId: EntityId.parse(row.missionId)._unsafeUnwrap(),
    userId: EntityId.parse(row.userId)._unsafeUnwrap(),
    state: row.state as ClaimState,
    heldUntil: row.heldUntil,
    releasedAt: row.releasedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

/** Folds `(state, count)` rows into the three numbers a slot sum needs. */
function tally(
  rows: readonly { state: string; total: number }[],
  into: SlotOccupancy = { ...NO_OCCUPANCY },
): SlotOccupancy {
  const occupancy = { ...into }
  for (const row of rows) {
    if (row.state === 'held') occupancy.held += Number(row.total)
    if (row.state === 'submitted') occupancy.submitted += Number(row.total)
    if (row.state === 'settled') occupancy.settled += Number(row.total)
  }

  return occupancy
}

@Injectable()
export class DrizzleClaimRepository implements ClaimRepository {
  async findById(id: EntityId): Promise<FeedbackClaim | null> {
    const rows = await getDb()
      .select()
      .from(feedbackClaims)
      .where(eq(feedbackClaims.id, id.value))
      .limit(1)
    const row = rows[0]

    return row === undefined ? null : toClaim(row)
  }

  async findLiveFor(missionId: EntityId, userId: EntityId): Promise<FeedbackClaim | null> {
    const rows = await getDb()
      .select()
      .from(feedbackClaims)
      .where(
        and(
          eq(feedbackClaims.missionId, missionId.value),
          eq(feedbackClaims.userId, userId.value),
          inArray(feedbackClaims.state, [...LIVE_CLAIM_STATES]),
        ),
      )
      .limit(1)
    const row = rows[0]

    return row === undefined ? null : toClaim(row)
  }

  /**
   * The whole concurrency story for FDBK-1's last slot. `select … for update`
   * would lock nothing when a mission has no claims yet, so two people taking
   * the only slot would both count zero; an advisory lock keyed on the mission
   * serialises them whether or not a row exists. It is taken on the mission id
   * rather than on the mission row, because that row belongs to another context.
   *
   * Held for the rest of the transaction, and released with it.
   */
  async lockOccupancy(missionId: EntityId): Promise<SlotOccupancy> {
    await getDb().execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${missionId.value}, 0))`,
    )

    return this.occupancyFor(missionId.value)
  }

  async occupancyFor(missionId: string): Promise<SlotOccupancy> {
    const rows = await getDb()
      .select({ state: feedbackClaims.state, total: sql<number>`count(*)::int` })
      .from(feedbackClaims)
      .where(
        and(
          eq(feedbackClaims.missionId, missionId),
          inArray(feedbackClaims.state, [...LIVE_CLAIM_STATES]),
        ),
      )
      .groupBy(feedbackClaims.state)

    return tally(rows)
  }

  async occupancyForMany(missionIds: readonly string[]): Promise<Map<string, SlotOccupancy>> {
    const occupancy = new Map<string, SlotOccupancy>()
    if (missionIds.length === 0) return occupancy

    const rows = await getDb()
      .select({
        missionId: feedbackClaims.missionId,
        state: feedbackClaims.state,
        total: sql<number>`count(*)::int`,
      })
      .from(feedbackClaims)
      .where(
        and(
          inArray(feedbackClaims.missionId, [...missionIds]),
          inArray(feedbackClaims.state, [...LIVE_CLAIM_STATES]),
        ),
      )
      .groupBy(feedbackClaims.missionId, feedbackClaims.state)

    for (const row of rows) {
      const current = occupancy.get(row.missionId) ?? { ...NO_OCCUPANCY }
      occupancy.set(row.missionId, tally([{ state: row.state, total: row.total }], current))
    }

    return occupancy
  }

  async save(claim: FeedbackClaim): Promise<void> {
    const row = {
      id: claim.id.value,
      missionId: claim.missionId.value,
      userId: claim.userId.value,
      state: claim.state,
      heldUntil: claim.heldUntil,
      releasedAt: claim.releasedAt,
      createdAt: claim.createdAt,
      updatedAt: claim.updatedAt,
    }

    await getDb()
      .insert(feedbackClaims)
      .values(row)
      .onConflictDoUpdate({
        target: feedbackClaims.id,
        set: { state: row.state, releasedAt: row.releasedAt, updatedAt: row.updatedAt },
      })
  }
}
