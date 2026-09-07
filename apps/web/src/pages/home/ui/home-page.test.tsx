import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HOME_HEADING, HomePage } from './home-page'

describe('HomePage', () => {
  it('leads with what the product does', () => {
    render(<HomePage />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(HOME_HEADING)
  })
})
