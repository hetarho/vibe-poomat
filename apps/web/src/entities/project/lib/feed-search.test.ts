import { describe, expect, it } from 'vitest'
import { feedSearchFor, parseFeedSearch } from './feed-search'
import { PROJECT_TAGS } from './project-rules'

describe('the tag filter in the URL (PROJ-3)', () => {
  it.each(PROJECT_TAGS)('reads %s back off the URL', (tag) => {
    expect(parseFeedSearch({ tag })).toEqual({ tag })
  })

  it('puts a chosen tag into the URL', () => {
    expect(feedSearchFor('Game')).toEqual({ tag: 'Game' })
  })

  it('puts nothing in the URL for no filter, rather than the word "all"', () => {
    expect(feedSearchFor(null)).toEqual({})
  })

  /** Into the URL and back again, which is what a reload does. */
  it.each(PROJECT_TAGS)('round-trips %s through the URL unchanged', (tag) => {
    expect(parseFeedSearch(feedSearchFor(tag) as Record<string, unknown>)).toEqual({ tag })
  })

  it('round-trips no filter as no filter', () => {
    expect(parseFeedSearch(feedSearchFor(null) as Record<string, unknown>)).toEqual({})
  })

  it.each([
    ['a tag that is not on the list', { tag: 'Crypto' }],
    ['a tag with the wrong case', { tag: 'tool' }],
    ['something that is not a string', { tag: 7 }],
    ['an empty value', { tag: '' }],
    ['nothing at all', {}],
  ])('drops %s', (_name, search) => {
    expect(parseFeedSearch(search)).toEqual({})
  })
})
