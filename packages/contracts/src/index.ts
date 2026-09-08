/**
 * Schemas shared by web and api. The cross-cutting ones are flat; each bounded
 * context arrives as its own namespace (`export * as auth from './auth'`) so a
 * name like `createSchema` can exist once per domain.
 */

export * as auth from './auth'
export * from './common'
export * as credits from './credits'
export * as projects from './projects'
export * as uploads from './uploads'
