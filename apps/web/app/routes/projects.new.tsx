import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { requireSession } from '../../src/features/auth'
import { ProjectNewPage } from '../../src/pages/project-new'

/**
 * Signed-in only, guarded before anything renders (T032): somebody who is not
 * signed in gets a redirect from the server rather than a form they cannot post.
 */
export const Route = createFileRoute('/projects/new')({
  beforeLoad: async ({ context, location }) => ({
    profile: await requireSession({ queryClient: context.queryClient, location }),
  }),
  component: ProjectNewRoute,
})

function ProjectNewRoute() {
  const navigate = useNavigate()

  return (
    <ProjectNewPage
      onCreated={(project) => {
        // `href` rather than `to`: the project page is T035's route, and this
        // navigation is already the right one for when it exists
        void navigate({ href: `/projects/${project.id}`, replace: true })
      }}
    />
  )
}
