import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { uploads } from '@repo/contracts'
import { createZodDto } from 'nestjs-zod'
import { WRITE_THROTTLER } from '../../shared/infrastructure/throttling/throttler-policy'
import { unwrap } from '../../shared/presentation'
import { CreateUploadUrlUseCase } from '../application/create-upload-url.use-case'

class CreateUploadUrlDto extends createZodDto(uploads.createUploadUrlRequestSchema) {}

@Controller('uploads')
export class UploadsController {
  constructor(private readonly createUploadUrl: CreateUploadUrlUseCase) {}

  /**
   * Minting a signed URL is cheap for us and valuable to an abuser, so it takes
   * the strict bucket (ARCH-41). The AUTH tasks add the session guard on top.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ [WRITE_THROTTLER]: {} })
  async create(@Body() body: CreateUploadUrlDto): Promise<uploads.UploadTicket> {
    const ticket = unwrap(
      await this.createUploadUrl.execute({
        purpose: body.purpose,
        contentType: body.contentType,
        sizeBytes: body.sizeBytes,
      }),
    )

    return {
      url: ticket.url,
      publicUrl: ticket.publicUrl,
      key: ticket.key,
      expiresInSeconds: ticket.expiresInSeconds,
    }
  }
}
