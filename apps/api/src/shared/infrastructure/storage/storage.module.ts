import { Global, Module } from '@nestjs/common'
import { FILE_STORAGE } from '../../application'
import { ConfigModule } from '../../config/config.module'
import { ENV, type Env } from '../../config/env.token'
import { DeleteObjectJob } from './delete-object.job'
import { S3FileStorage } from './s3-file-storage'

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: FILE_STORAGE,
      inject: [ENV],
      useFactory: (config: Env) =>
        new S3FileStorage({
          endpoint: config.S3_ENDPOINT,
          bucket: config.S3_BUCKET,
          accessKeyId: config.S3_ACCESS_KEY_ID,
          secretAccessKey: config.S3_SECRET_ACCESS_KEY,
          publicBaseUrl: config.S3_PUBLIC_BASE_URL,
        }),
    },
    DeleteObjectJob,
  ],
  exports: [FILE_STORAGE, DeleteObjectJob],
})
export class StorageModule {}
