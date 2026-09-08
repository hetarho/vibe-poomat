import type { NotificationType } from '../domain/notification-type'
import type { UnsubscribeToken } from './unsubscribe-token'

/**
 * Every URL a notification email carries, built in one place so NOTI-4's promise
 * — a deep link to the item and a way to stop this kind of email — is kept the
 * same way seven times.
 *
 * The web routes are the ones T032-T038 build. They are written here rather than
 * discovered, so a broken link is a diff in this file and nothing else.
 */
export class DeepLinks {
  constructor(
    private readonly webUrl: string,
    private readonly apiUrl: string,
    private readonly tokens: UnsubscribeToken,
  ) {}

  feedback(feedbackId: string): string {
    return this.web(`/feedbacks/${feedbackId}`)
  }

  project(projectId: string): string {
    return this.web(`/projects/${projectId}`)
  }

  settings(): string {
    return this.web('/settings/notifications')
  }

  /** Null for the type NOTI-3 will not let anybody switch off. */
  unsubscribe(userId: string, type: NotificationType, allowed: boolean): string | null {
    if (!allowed) return null

    const token = encodeURIComponent(this.tokens.sign({ userId, type }))

    return `${trimEnd(this.apiUrl)}/api/v1/notifications/unsubscribe?token=${token}`
  }

  private web(path: string): string {
    return `${trimEnd(this.webUrl)}${path}`
  }
}

function trimEnd(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}
