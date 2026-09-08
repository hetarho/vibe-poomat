import type { projects } from '@repo/contracts'

/** PROJ-6's four states, in words rather than a database value. */
const STATE_LABEL: Readonly<Record<projects.MissionState, string>> = {
  open: 'Open',
  completed: 'Completed',
  closed: 'Closed by the maker',
  expired: 'Expired',
}

export const NO_MISSION =
  'No mission is open, so there are no slots to take right now. The maker opens one when they want feedback.'

/** PROJ-7, said where somebody might otherwise expect an edit button. */
export const FROZEN_NOTICE =
  'The task, the questions and the live URL cannot change while this mission is open — feedback has to match what the feedbackers were sent to look at.'

type MissionPanelProps = {
  /** The newest mission, open or over; null when the project never ran one. */
  mission: projects.Mission | null
}

function on(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

type SlotLineProps = { label: string; value: number; testId: string }

function SlotLine({ label, value, testId }: SlotLineProps) {
  return (
    <div className="flex flex-col">
      <span className="font-medium text-lg tabular-nums" data-testid={testId}>
        {value}
      </span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  )
}

/**
 * What a mission is, for anybody: the frozen task and questions a feedbacker
 * works from (PROJ-7), where each slot stands (FDBK-1), and the date the thing
 * ends. The expiry is the one the api returned — opened + 30 days, computed
 * there rather than from this browser's clock.
 */
export function MissionPanel({ mission }: MissionPanelProps) {
  if (mission === null) {
    return <p className="text-muted-foreground text-sm">{NO_MISSION}</p>
  }

  const { occupancy } = mission
  const taken = occupancy.held + occupancy.submitted + occupancy.settled

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium text-sm" data-testid="mission-state">
          {STATE_LABEL[mission.state]}
        </span>
        <span className="text-muted-foreground text-sm">
          {mission.state === 'open'
            ? `closes ${on(mission.expiresAt)}`
            : `ended ${mission.endedAt === null ? on(mission.expiresAt) : on(mission.endedAt)}`}
        </span>
        <span className="text-muted-foreground text-sm">· opened {on(mission.openedAt)}</span>
      </div>

      <div className="flex flex-wrap gap-6">
        <SlotLine
          label={mission.state === 'open' ? 'claimable' : 'refunded'}
          value={occupancy.claimable}
          testId="slots-claimable"
        />
        <SlotLine label="being worked on" value={occupancy.held} testId="slots-held" />
        <SlotLine label="waiting to settle" value={occupancy.submitted} testId="slots-submitted" />
        <SlotLine label="settled" value={occupancy.settled} testId="slots-settled" />
        <SlotLine label="slots in total" value={mission.slots} testId="slots-total" />
      </div>

      {mission.state === 'open' ? null : (
        <p className="text-muted-foreground text-sm" data-testid="refund-summary">
          {taken === 0
            ? `Nobody took a slot, so all ${mission.slots} credits came back.`
            : `${taken} of ${mission.slots} slots were taken; the other ${occupancy.claimable} came back.`}
          {occupancy.held + occupancy.submitted > 0
            ? ' The slots somebody is still on stay escrowed until they resolve.'
            : ''}
        </p>
      )}

      <div>
        <h3 className="font-medium text-sm">The task</h3>
        <p className="mt-1 whitespace-pre-wrap text-sm">{mission.taskText}</p>
      </div>

      {mission.questions.length === 0 ? null : (
        <div>
          <h3 className="font-medium text-sm">Questions the maker asked</h3>
          <ol className="mt-1 list-decimal pl-5 text-sm">
            {mission.questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ol>
        </div>
      )}

      {mission.state === 'open' ? (
        <p className="text-muted-foreground text-xs">{FROZEN_NOTICE}</p>
      ) : null}
    </div>
  )
}
