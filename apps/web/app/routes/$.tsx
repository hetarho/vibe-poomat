import { createFileRoute } from '@tanstack/react-router'
import { NotFoundPage } from '../../src/pages/not-found'

export const Route = createFileRoute('/$')({ component: NotFoundPage })
