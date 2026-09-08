import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { projectQueryOptions } from '../../src/entities/project'
import { requireSession } from '../../src/features/auth'
import { ProjectEditPage } from '../../src/pages/project-edit'
import { forwardedHeaders } from '../../src/shared/api'

/**
 * Owner-only. The session is required before anything renders; whether this
 * account is the owner is decided by the page, because the project has to be
 * fetched to know that at all.
 */
export const Route = createFileRoute('/projects/$id/edit')({
  beforeLoad: async ({ context, location }) => ({
    profile: await requireSession({ queryClient: context.queryClient, location }),
  }),
  loader: async ({ context, params }) => {
    const headers = import.meta.env.SSR ? forwardedHeaders(getRequestHeaders()) : undefined

    await context.queryClient.ensureQueryData(projectQueryOptions(params.id, headers))
  },
  component: ProjectEditRoute,
})

function ProjectEditRoute() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const project = useQuery(projectQueryOptions(id))

  return (
    <ProjectEditPage
      project={project.data ?? null}
      onDeleted={() => void navigate({ to: '/', replace: true })}
    />
  )
}
