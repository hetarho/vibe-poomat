import type { projects } from '@repo/contracts'
import { CreateProjectForm } from '../../../features/create-project'

export const NEW_PROJECT_HEADING = 'Post a project'

type ProjectNewPageProps = {
  onCreated: (project: projects.Project) => void
}

/**
 * PROJ-12: there is no draft to save and no publish step to find later, so the
 * page says so rather than leaving somebody looking for one.
 */
export function ProjectNewPage({ onCreated }: ProjectNewPageProps) {
  return (
    <div className="flex max-w-xl flex-col gap-8">
      <header>
        <h1 className="font-semibold text-2xl tracking-tight">{NEW_PROJECT_HEADING}</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          It goes public the moment it is posted — there is no draft. Your URL is opened once from
          the server first, because the first person here has to be able to use it.
        </p>
      </header>

      <CreateProjectForm onCreated={onCreated} />
    </div>
  )
}
