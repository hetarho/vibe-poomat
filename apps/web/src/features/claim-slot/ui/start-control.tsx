import type { ComponentProps } from 'react'
import { Button } from '../../../shared/ui'

type StartControlProps = Omit<ComponentProps<typeof Button>, 'children'> & {
  label?: string
}

export const START_LABEL = 'Start — take a slot'

/**
 * The button, with no idea what pressing it does. Two things use it: the
 * feature's own claiming block, and a sign-in dialog trigger for somebody who
 * cannot claim yet — which is why the props pass straight through.
 */
export function StartControl({ label = START_LABEL, ...rest }: StartControlProps) {
  return (
    <Button type="button" {...rest}>
      {label}
    </Button>
  )
}
