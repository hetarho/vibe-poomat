import { Module } from '@nestjs/common'
import { FILE_STORAGE, type FileStorage } from '../shared/application'
import { CreateUploadUrlUseCase } from './application/create-upload-url.use-case'
import { UploadsController } from './presentation/uploads.controller'

@Module({
  controllers: [UploadsController],
  providers: [
    {
      // the use case knows nothing about Nest, so the module builds it
      provide: CreateUploadUrlUseCase,
      inject: [FILE_STORAGE],
      useFactory: (storage: FileStorage) => new CreateUploadUrlUseCase(storage),
    },
  ],
})
export class UploadsModule {}
