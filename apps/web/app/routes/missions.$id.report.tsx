import type { feedback } from '@repo/contracts'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { useState } from 'react'
import { myClaimQueryOptions } from '../../src/entities/feedback'
import { missionQueryOptions } from '../../src/entities/mission'
import { projectQueryOptions } from '../../src/entities/project'
import { requireSession } from '../../src/features/auth'
import { ReportPage } from '../../src/pages/report'
import { forwardedHeaders } from '../../src/shared/api'

/**
 * Signed-in only: a report needs a slot, and a slot needs an account (FDBK-2).
 * The mission, the claim and the project are all resolved before the first
 * render, so somebody who is not holding a slot is told so immediately rather
 * than being shown a form that then disappears.
 */
export const Route = createFileRoute('/missions/$id/report')({
  beforeLoad: async ({ context, location }) => ({
    profile: await requireSession({ queryClient: context.queryClient, location }),
  }),
  loader: async ({ context, params }) => {
    const headers = import.meta.env.SSR ? forwardedHeaders(getRequestHeaders()) : undefined

    const [mission] = await Promise.all([
      context.queryClient.ensureQueryData(missionQueryOptions(params.id, headers)),
      context.queryClient.ensureQueryData(myClaimQueryOptions(params.id, headers)),
    ])
    if (mission === null) return

    // the live URL is the point of the exercise, so it is fetched too
    await context.queryClient.ensureQueryData(projectQueryOptions(mission.projectId, headers))
  },
  component: ReportRoute,
})

function ReportRoute() {
  const { id } = Route.useParams()
  const [justSubmitted, setJustSubmitted] = useState<feedback.Feedback | null>(null)
  const mission = useQuery(missionQueryOptions(id))
  const claim = useQuery(myClaimQueryOptions(id))
  const project = useQuery({
    ...projectQueryOptions(mission.data?.projectId ?? ''),
    enabled: mission.data != null,
  })

  return (
    <ReportPage
      mission={mission.data ?? null}
      claim={claim.data ?? null}
      project={project.data ?? null}
      justSubmitted={justSubmitted}
      onSubmitted={setJustSubmitted}
    />
  )
}
