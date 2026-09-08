import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { feedbackItemsOf, projectFeedbackQueryOptions } from '../../src/entities/feedback'
import { projectQueryOptions } from '../../src/entities/project'
import { ProjectDetailPage } from '../../src/pages/project-detail'
import { forwardedHeaders } from '../../src/shared/api'

/**
 * Public (PROJ-12), and the reader still matters: PROJ-8 lets an owner keep
 * seeing their own deleted project, and PROJ-11 needs to know whether this
 * account's upvote already stands. Both come off the session cookie, which SSR
 * has to forward by hand.
 *
 * Everything is resolved before the first render, so the page arrives complete
 * rather than filling itself in, and a project nobody can see renders its own
 * not-found instead of an error boundary.
 */
export const Route = createFileRoute('/projects/$id')({
  loader: async ({ context, params }) => {
    const headers = import.meta.env.SSR ? forwardedHeaders(getRequestHeaders()) : undefined

    const project = await context.queryClient.ensureQueryData(
      projectQueryOptions(params.id, headers),
    )
    if (project === null) return

    await context.queryClient.ensureInfiniteQueryData(
      projectFeedbackQueryOptions(params.id, headers),
    )
  },
  component: ProjectDetailRoute,
})

function ProjectDetailRoute() {
  const { id } = Route.useParams()
  const project = useQuery(projectQueryOptions(id))
  const reports = useInfiniteQuery({
    ...projectFeedbackQueryOptions(id),
    enabled: project.data != null,
  })

  return (
    <ProjectDetailPage
      project={project.data ?? null}
      reports={feedbackItemsOf(reports.data)}
      hasMoreReports={reports.hasNextPage}
      loadingMoreReports={reports.isFetchingNextPage}
      onLoadMoreReports={() => void reports.fetchNextPage()}
    />
  )
}
