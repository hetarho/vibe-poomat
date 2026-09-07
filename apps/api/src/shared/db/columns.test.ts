import { getTableConfig, pgTable, text } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { entityId, timestamps } from './columns'

const example = pgTable('example', {
  id: entityId(),
  label: text('label').notNull(),
  ...timestamps(),
})

const columns = new Map(getTableConfig(example).columns.map((column) => [column.name, column]))

describe('entityId', () => {
  it('is a uuid primary key named id', () => {
    const id = columns.get('id')

    expect(id?.getSQLType()).toBe('uuid')
    expect(id?.primary).toBe(true)
    expect(id?.notNull).toBe(true)
  })

  it('has no database default, because the application mints the UUIDv7', () => {
    const id = columns.get('id')

    expect(id?.hasDefault).toBe(false)
    expect(id?.defaultFn).toBeUndefined()
  })
})

describe('timestamps', () => {
  it.each(['created_at', 'updated_at'])(
    'makes %s a non-null timestamptz defaulting to now()',
    (name) => {
      const column = columns.get(name)

      expect(column?.getSQLType()).toBe('timestamp with time zone')
      expect(column?.notNull).toBe(true)
      expect(column?.hasDefault).toBe(true)
    },
  )

  it('adds no deleted_at, since soft delete is opt-in per SSOT and not a default', () => {
    expect([...columns.keys()]).toEqual(['id', 'label', 'created_at', 'updated_at'])
  })
})
