import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import {
  DELETE_OBJECT_JOB,
  type DeleteObjectPayload,
  FILE_STORAGE,
  type FileStorage,
  type JobHandler,
} from '../../application'
import { JobRegistry } from '../jobs/job-registry'

/**
 * Deleting the object an entity owned is best effort: the entity is already
 * gone, and a storage hiccup must not fail the use case that removed it. Runs
 * in a job so the failure is retried rather than lost, and swallowed after that.
 */
@Injectable()
export class DeleteObjectJob implements JobHandler<DeleteObjectPayload>, OnModuleInit {
  readonly jobName = DELETE_OBJECT_JOB
  private readonly logger = new Logger(DeleteObjectJob.name)

  constructor(
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly registry: JobRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this)
  }

  async handle(data: DeleteObjectPayload): Promise<void> {
    try {
      await this.storage.delete(data.key)
    } catch (error) {
      // an object that outlives its row costs storage, never correctness
      this.logger.error(
        `could not delete ${data.key}`,
        error instanceof Error ? error.stack : error,
      )
    }
  }
}
