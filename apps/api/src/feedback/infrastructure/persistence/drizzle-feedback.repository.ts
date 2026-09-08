import { Injectable } from '@nestjs/common'
import { asc, eq } from 'drizzle-orm'
import { getDb, isUniqueViolation } from '../../../shared/db'
import { EntityId } from '../../../shared/kernel'
import type { DomainError, Result } from '../../../shared/result'
import { FeedbackNotPendingError } from '../../domain/claim-errors'
import { Feedback, type FeedbackState, type RejectionReason } from '../../domain/feedback'
import type { FeedbackRepository } from '../../domain/feedback.repository'
import { ReportField } from '../../domain/report'
import { feedbacks } from './schema'

/** One report per claim; drizzle-kit names the constraint behind the column. */
const ONE_PER_CLAIM = 'feedbacks_claim_id_unique'

function must<T>(result: Result<T, DomainError>, what: string): T {
  if (result.isErr()) throw new Error(`stored ${what} is not valid: ${result.error.message}`)

  return result.value
}

type Row = typeof feedbacks.$inferSelect

function toFeedback(row: Row): Feedback {
  return Feedback.restore(must(EntityId.parse(row.id), 'feedback id'), {
    claimId: must(EntityId.parse(row.claimId), 'claim id'),
    missionId: must(EntityId.parse(row.missionId), 'mission id'),
    projectId: must(EntityId.parse(row.projectId), 'project id'),
    authorId: row.authorId === null ? null : must(EntityId.parse(row.authorId), 'author id'),
    report: {
      firstImpression: must(
        ReportField.create('firstImpression', row.firstImpression),
        'first impression',
      ),
      stuckAt: must(ReportField.create('stuckAt', row.stuckAt), 'stuck at'),
      wouldPay: row.wouldPay,
      wouldPayReason: must(
        ReportField.create('wouldPayReason', row.wouldPayReason),
        'would pay reason',
      ),
      suggestion: must(ReportField.create('suggestion', row.suggestion), 'suggestion'),
      answers: row.answers.map((answer, index) =>
        must(ReportField.create(`answers.${index}`, answer), `answer ${index}`),
      ),
    },
    state: row.state as FeedbackState,
    rejectionReason: row.rejectionReason as RejectionReason | null,
    rejectionNote: row.rejectionNote,
    submittedAt: row.submittedAt,
    settledAt: row.settledAt,
  })
}

@Injectable()
export class DrizzleFeedbackRepository implements FeedbackRepository {
  async findById(id: EntityId): Promise<Feedback | null> {
    const rows = await getDb().select().from(feedbacks).where(eq(feedbacks.id, id.value)).limit(1)
    const row = rows[0]

    return row === undefined ? null : toFeedback(row)
  }

  async findByClaimId(claimId: EntityId): Promise<Feedback | null> {
    const rows = await getDb()
      .select()
      .from(feedbacks)
      .where(eq(feedbacks.claimId, claimId.value))
      .limit(1)
    const row = rows[0]

    return row === undefined ? null : toFeedback(row)
  }

  async listForMission(missionId: EntityId): Promise<Feedback[]> {
    const rows = await getDb()
      .select()
      .from(feedbacks)
      .where(eq(feedbacks.missionId, missionId.value))
      .orderBy(asc(feedbacks.submittedAt))

    return rows.map(toFeedback)
  }

  /**
   * The report itself is never in the update set: FDBK-4 makes it immutable, so
   * only the settlement around it can move. A second submit for the same claim
   * hits the unique column rather than overwriting what was written.
   */
  async save(feedback: Feedback): Promise<void> {
    const row = {
      id: feedback.id.value,
      claimId: feedback.claimId.value,
      missionId: feedback.missionId.value,
      projectId: feedback.projectId.value,
      authorId: feedback.authorId?.value ?? null,
      firstImpression: feedback.report.firstImpression.value,
      stuckAt: feedback.report.stuckAt.value,
      wouldPay: feedback.report.wouldPay,
      wouldPayReason: feedback.report.wouldPayReason.value,
      suggestion: feedback.report.suggestion.value,
      answers: feedback.report.answers.map((answer) => answer.value),
      state: feedback.state,
      rejectionReason: feedback.rejectionReason,
      rejectionNote: feedback.rejectionNote,
      submittedAt: feedback.submittedAt,
      settledAt: feedback.settledAt,
    }

    try {
      await getDb()
        .insert(feedbacks)
        .values(row)
        .onConflictDoUpdate({
          target: feedbacks.id,
          set: {
            authorId: row.authorId,
            state: row.state,
            rejectionReason: row.rejectionReason,
            rejectionNote: row.rejectionNote,
            settledAt: row.settledAt,
            updatedAt: new Date(),
          },
        })
    } catch (error) {
      if (isUniqueViolation(error, ONE_PER_CLAIM)) {
        throw new FeedbackNotPendingError('this slot already has a report')
      }
      throw error
    }
  }
}
