import { Module } from '@nestjs/common'
import {
  CREDIT_SUMMARY_READER,
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../shared/application'
import { CREDIT_SERVICE, CreditLedgerService } from './application/credit-ledger.service'
import { GetMyCreditsUseCase } from './application/get-my-credits.use-case'
import { CREDIT_LEDGER, type CreditLedger } from './domain/credit-ledger.repository'
import { GrantSeedOnAccountCreated } from './infrastructure/grant-seed-on-account-created'
import { DrizzleCreditLedgerRepository } from './infrastructure/persistence/drizzle-credit-ledger.repository'
import { CreditsController } from './presentation/credits.controller'

/**
 * The `credit` bounded context (ARCH-9). It owns the ledger and nothing else
 * writes to it; other contexts reach it through `CREDIT_SERVICE` for the named
 * operations, or through the read-only `CREDIT_SUMMARY_READER` when all they
 * want is the counters on a profile (CRED-7).
 */
@Module({
  controllers: [CreditsController],
  providers: [
    { provide: CREDIT_LEDGER, useClass: DrizzleCreditLedgerRepository },
    {
      provide: CreditLedgerService,
      inject: [CREDIT_LEDGER, TRANSACTION_MANAGER],
      useFactory: (ledger: CreditLedger, transactions: TransactionManager) =>
        new CreditLedgerService(ledger, transactions),
    },
    { provide: CREDIT_SERVICE, useExisting: CreditLedgerService },
    // the same object under the narrower contract, so a consumer that only reads
    // cannot reach an operation that writes
    { provide: CREDIT_SUMMARY_READER, useExisting: CreditLedgerService },
    {
      provide: GetMyCreditsUseCase,
      inject: [CREDIT_LEDGER],
      useFactory: (ledger: CreditLedger) => new GetMyCreditsUseCase(ledger),
    },
    GrantSeedOnAccountCreated,
  ],
  exports: [CREDIT_SERVICE, CREDIT_SUMMARY_READER, CreditLedgerService],
})
export class CreditModule {}
