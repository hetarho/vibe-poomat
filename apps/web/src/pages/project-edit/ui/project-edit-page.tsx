import type { projects } from '@repo/contracts'
import { useCurrentUser } from '../../../entities/session'
import { DeleteProjectSection } from '../../../features/delete-project'
import { EditProjectForm } from '../../../features/edit-project'

export const EDIT_PROJECT_HEADING = 'Edit project'
export const NOT_YOURS_HEADING = 'Not your project'

type ProjectEditPageProps = {
  /** Null when there is no such project, or none this account may see (PROJ-8). */
  project: projects.Project | null
  onDeleted: () => void
}

/**
 * PROJ-12's single owner, so the page is either yours or it is nothing. The
 * server refuses a stranger's PATCH regardless — this stops the form from being
 * offered in the first place, which is a different job from refusing it.
 */
export function ProjectEditPage({ project, onDeleted }: ProjectEditPageProps) {
  const viewer = useCurrentUser()

  if (project === null || viewer === null || project.owner.id !== viewer.id) {
    return (
      <section>
        <h1 className="font-semibold text-2xl tracking-tight">{NOT_YOURS_HEADING}</h1>
        <p className="mt-2 text-muted-foreground">
          There is nothing here to edit. A project can only be changed by the account that posted
          it.
        </p>
      </section>
    )
  }

  return (
    <div className="flex max-w-xl flex-col gap-10">
      <header>
        <h1 className="font-semibold text-2xl tracking-tight">{EDIT_PROJECT_HEADING}</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          <a href={`/projects/${project.id}`} className="underline underline-offset-4">
            {project.title}
          </a>
        </p>
      </header>

      <EditProjectForm project={project} />

      <DeleteProjectSection
        projectId={project.id}
        title={project.title}
        missionIsOpen={project.activeMission !== null}
        onDeleted={onDeleted}
      />
    </div>
  )
}
