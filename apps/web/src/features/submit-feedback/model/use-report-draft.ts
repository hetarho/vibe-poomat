import { useCallback, useEffect, useState } from 'react'
import { emptyReport, type ReportDraft } from '../../../entities/feedback'

/** One key per claim, so two slots never overwrite each other's work. */
export function draftKey(claimId: string): string {
  return `poomat.report-draft.${claimId}`
}

function read(claimId: string, questionCount: number): ReportDraft | null {
  try {
    const stored = localStorage.getItem(draftKey(claimId))
    if (stored === null) return null

    const parsed = JSON.parse(stored) as Partial<ReportDraft>

    // a stored draft is whatever was in this browser: shape it, never trust it
    return {
      ...emptyReport(questionCount),
      ...parsed,
      answers: Array.from(
        { length: questionCount },
        (_value, index) => parsed.answers?.[index] ?? '',
      ),
    }
  } catch {
    // a private window, cleared site data, or a browser refusing storage
    return null
  }
}

/**
 * A refresh must not cost somebody the report they were writing. The draft is
 * this browser's convenience and nothing more — never authoritative, and never
 * sent anywhere: a server-side draft would contradict FDBK-4, which makes the
 * submitted report the single artifact the maker judges.
 *
 * It is read after mount rather than during render, because the server has no
 * `localStorage` and a value that differs between the two renders is a
 * hydration mismatch.
 */
export function useReportDraft(
  claimId: string,
  questionCount: number,
): {
  draft: ReportDraft
  update: (patch: Partial<ReportDraft>) => void
  clear: () => void
  restored: boolean
} {
  const [draft, setDraft] = useState(() => emptyReport(questionCount))
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    const stored = read(claimId, questionCount)
    if (stored !== null) {
      setDraft(stored)
      setRestored(true)
    }
  }, [claimId, questionCount])

  const update = useCallback(
    (patch: Partial<ReportDraft>) => {
      setDraft((previous) => {
        const next = { ...previous, ...patch }
        try {
          localStorage.setItem(draftKey(claimId), JSON.stringify(next))
        } catch {
          // out of quota or storage blocked: the form still works, unsaved
        }

        return next
      })
    },
    [claimId],
  )

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(draftKey(claimId))
    } catch {
      // nothing to do: there is no draft to lose either way
    }
  }, [claimId])

  return { draft, update, clear, restored }
}
