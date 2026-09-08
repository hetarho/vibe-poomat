import type { projects } from '@repo/contracts'
import { useQuery } from '@tanstack/react-query'
import { myCreditsQueryOptions } from '../../../entities/credit'
import { CloseMissionDialog } from '../../../features/close-mission'
import { ALREADY_OPEN, OpenMissionForm } from '../../../features/open-mission'

export const OPEN_A_MISSION_HEADING = 'Open a mission'

type OwnerMissionBlockProps = {
  projectId: string
  /** The open mission, or null when there is none to close (PROJ-5). */
  openMission: projects.Mission | null
}

/**
 * Everything only the owner may do with a mission. It is a module of its own so
 * that a visitor's browser never fetches it: this file is the default export
 * behind the page's `lazy()`, and a page with no owner never asks for the chunk.
 *
 * The balance is read here rather than passed in for the same reason — a visitor
 * must not cause a request for somebody else's credits (CRED-7).
 */
export default function OwnerMissionBlock({ projectId, openMission }: OwnerMissionBlockProps) {
  const credits = useQuery(myCreditsQueryOptions())

  if (openMission !== null) {
    return (
      <section aria-labelledby="owner-mission-heading" className="flex flex-col gap-3">
        <h2 id="owner-mission-heading" className="font-medium text-sm">
          Your mission
        </h2>
        <p className="text-muted-foreground text-sm">{ALREADY_OPEN}</p>
        <div className="self-start">
          <CloseMissionDialog projectId={projectId} mission={openMission} />
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="owner-mission-heading" className="flex flex-col gap-4">
      <h2 id="owner-mission-heading" className="font-medium text-lg">
        {OPEN_A_MISSION_HEADING}
      </h2>
      {credits.isPending ? (
        <p className="text-muted-foreground text-sm">Checking your balance…</p>
      ) : (
        <OpenMissionForm
          projectId={projectId}
          balance={credits.data?.balance ?? 0}
          onOpened={() => undefined}
        />
      )}
    </section>
  )
}
