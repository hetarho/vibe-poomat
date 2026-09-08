import type { feedback, projects } from '@repo/contracts'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { isLapsed } from '../../../entities/feedback'
import { MissionPanel } from '../../../entities/mission'
import { LAPSED_NOTICE } from '../../../features/claim-slot'
import { ReportForm } from '../../../features/submit-feedback'
import { Button } from '../../../shared/ui'

export const NO_MISSION_HEADING = 'No such mission'
export const NO_CLAIM_HEADING = 'You are not holding a slot'
export const HOLD_LAPSED_HEADING = 'That hold ran out'
export const SUBMITTED_HEADING = 'Your report is in'
export const IMMUTABLE_NOTICE =
  'A submitted report cannot be edited — the maker judges exactly what you wrote.'
export const SETTLE_WINDOW =
  'The maker has 72 hours to accept or reject it. After that it is accepted automatically and the credit is yours.'

type ReportPageProps = {
  mission: projects.Mission | null
  /** FDBK-2's one claim, or null when this account holds none. */
  claim: feedback.Claim | null
  project: projects.Project | null
  /** Set after this visit submitted one, so the page can say so at once. */
  justSubmitted: feedback.Feedback | null
  onSubmitted: (report: feedback.Feedback) => void
}

function Shell({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="max-w-2xl">
      <h1 className="font-semibold text-2xl tracking-tight">{heading}</h1>
      <div className="mt-3 flex flex-col gap-3 text-muted-foreground">{children}</div>
    </section>
  )
}

/**
 * The report, beside the task it answers. The mission panel is here on purpose:
 * PROJ-7 freezes the task and the questions precisely so that what somebody is
 * reading while they write is what the maker asked for.
 */
export function ReportPage({
  mission,
  claim,
  project,
  justSubmitted,
  onSubmitted,
}: ReportPageProps) {
  if (mission === null) {
    return (
      <Shell heading={NO_MISSION_HEADING}>
        <p>There is no mission at this address.</p>
        <Link to="/" className="underline underline-offset-4">
          Back to the feed
        </Link>
      </Shell>
    )
  }

  const backToProject = (
    <Link
      to="/projects/$id"
      params={{ id: mission.projectId }}
      className="underline underline-offset-4"
    >
      {project === null ? 'Back to the project' : `Back to ${project.title}`}
    </Link>
  )

  const submitted = justSubmitted !== null || claim?.state === 'submitted'
  if (submitted) {
    return (
      <Shell heading={SUBMITTED_HEADING}>
        <p>{IMMUTABLE_NOTICE}</p>
        <p>{SETTLE_WINDOW}</p>
        {backToProject}
      </Shell>
    )
  }

  if (claim === null || claim.state !== 'held') {
    return (
      <Shell heading={NO_CLAIM_HEADING}>
        <p>
          A report needs a slot, and this account is not holding one on this mission. Take one from
          the project page if any are left.
        </p>
        {backToProject}
      </Shell>
    )
  }

  if (isLapsed(claim.heldUntil, Date.now())) {
    return (
      <Shell heading={HOLD_LAPSED_HEADING}>
        <p>{LAPSED_NOTICE}</p>
        <p>
          {mission.occupancy.claimable > 0
            ? 'There are still slots on this mission — take another one.'
            : 'Every slot is taken at the moment. Holds lapse, so it is worth looking again later.'}
        </p>
        {backToProject}
      </Shell>
    )
  }

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
      <div className="lg:order-2 lg:w-80 lg:shrink-0">
        <div className="flex flex-col gap-3 lg:sticky lg:top-6">
          <h2 className="font-medium text-sm">What you were asked</h2>
          <MissionPanel mission={mission} />
          {project === null ? null : (
            <Button asChild variant="outline">
              <a href={project.liveUrl} target="_blank" rel="noopener noreferrer">
                Open {new URL(project.liveUrl).hostname}
              </a>
            </Button>
          )}
          {backToProject}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <header>
          <h1 className="font-semibold text-2xl tracking-tight">Write your report</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Every field is required and needs a real answer. {IMMUTABLE_NOTICE}
          </p>
        </header>
        <div className="mt-6">
          <ReportForm
            claim={claim}
            mission={mission}
            projectId={mission.projectId}
            onSubmitted={onSubmitted}
          />
        </div>
      </div>
    </div>
  )
}
