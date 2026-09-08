import { Global, Module } from '@nestjs/common'
import { MAKER_STATS_READER, SLOT_OCCUPANCY_READER } from '../shared/application'
import { GetMakerStatsUseCase } from './application/get-maker-stats.use-case'
import { CLAIM_REPOSITORY } from './domain/claim.repository'
import { FEEDBACK_REPOSITORY } from './domain/feedback.repository'
import { MAKER_STATS_QUERY, type MakerStatsQuery } from './domain/maker-stats.query'
import { DrizzleClaimRepository } from './infrastructure/persistence/drizzle-claim.repository'
import { DrizzleFeedbackRepository } from './infrastructure/persistence/drizzle-feedback.repository'
import { DrizzleMakerStatsQuery } from './infrastructure/persistence/drizzle-maker-stats.query'

/**
 * The rows this context owns, and the questions other contexts ask of them.
 * Global, because both consumers sit upstream of it and could not import it
 * without a cycle: the project context needs the slot arithmetic (PROJ-6,
 * PROJ-9) while `feedback` already imports `project` to read a mission, and the
 * auth context puts FDBK-8's stats on a profile while `feedback` already imports
 * `auth` to name a report's author.
 */
@Global()
@Module({
  providers: [
    { provide: CLAIM_REPOSITORY, useClass: DrizzleClaimRepository },
    { provide: FEEDBACK_REPOSITORY, useClass: DrizzleFeedbackRepository },
    { provide: SLOT_OCCUPANCY_READER, useExisting: CLAIM_REPOSITORY },
    { provide: MAKER_STATS_QUERY, useClass: DrizzleMakerStatsQuery },
    {
      provide: GetMakerStatsUseCase,
      inject: [MAKER_STATS_QUERY],
      useFactory: (tally: MakerStatsQuery) => new GetMakerStatsUseCase(tally),
    },
    // the same object under the narrower contract, so a profile can read the
    // counts without reaching anything that decides a settlement
    { provide: MAKER_STATS_READER, useExisting: GetMakerStatsUseCase },
  ],
  exports: [
    CLAIM_REPOSITORY,
    FEEDBACK_REPOSITORY,
    SLOT_OCCUPANCY_READER,
    GetMakerStatsUseCase,
    MAKER_STATS_READER,
  ],
})
export class ClaimStoreModule {}
