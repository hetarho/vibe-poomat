import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NOT_FOUND_MESSAGE, NotFoundPage } from './not-found-page'

/** The page links home, so it needs a router in context. */
function renderInRouter() {
  const rootRoute = createRootRoute({ component: NotFoundPage })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  return render(<RouterProvider router={router} />)
}

describe('NotFoundPage', () => {
  it('says the page does not exist', async () => {
    renderInRouter()

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('404')
    expect(screen.getByText(NOT_FOUND_MESSAGE)).toBeInTheDocument()
  })

  it('offers a way back', async () => {
    renderInRouter()

    expect(await screen.findByRole('link', { name: 'Back to the feed' })).toHaveAttribute(
      'href',
      '/',
    )
  })
})
