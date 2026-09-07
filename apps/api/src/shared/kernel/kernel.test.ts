import { describe, expect, it } from 'vitest'
import { AggregateRoot } from './aggregate-root'
import { DomainEvent } from './domain-event'
import { Entity } from './entity'
import { EntityId } from './entity-id'
import { ValueObject } from './value-object'

type MoneyProps = { amount: number; currency: string }

class Money extends ValueObject<MoneyProps> {
  static of(amount: number, currency: string): Money {
    return new Money({ amount, currency })
  }
}

class Weight extends ValueObject<MoneyProps> {
  static of(amount: number, currency: string): Weight {
    return new Weight({ amount, currency })
  }
}

type OrderProps = { total: number }

class Order extends Entity<OrderProps> {
  static of(id: EntityId, total: number): Order {
    return new Order(id, { total })
  }
}

class Shipment extends Entity<OrderProps> {
  static of(id: EntityId, total: number): Shipment {
    return new Shipment(id, { total })
  }
}

class OrderPlaced extends DomainEvent {
  readonly name = 'order.placed'
}

class Cart extends AggregateRoot<OrderProps> {
  static of(id: EntityId): Cart {
    return new Cart(id, { total: 0 })
  }

  place(): void {
    this.record(new OrderPlaced(this.id))
  }
}

describe('ValueObject', () => {
  it('is equal when every prop is equal, whatever the instance', () => {
    expect(Money.of(10, 'KRW').equals(Money.of(10, 'KRW'))).toBe(true)
  })

  it('is not equal when a prop differs', () => {
    expect(Money.of(10, 'KRW').equals(Money.of(11, 'KRW'))).toBe(false)
  })

  it('is not equal to another class holding the same props', () => {
    expect(Money.of(10, 'KRW').equals(Weight.of(10, 'KRW'))).toBe(false)
  })

  it('is not equal to nothing', () => {
    expect(Money.of(10, 'KRW').equals(null)).toBe(false)
    expect(Money.of(10, 'KRW').equals(undefined)).toBe(false)
  })
})

describe('Entity', () => {
  it('is equal on id alone, even when the props differ', () => {
    const id = EntityId.generate()

    expect(Order.of(id, 100).equals(Order.of(id, 999))).toBe(true)
  })

  it('is not equal when the id differs', () => {
    expect(Order.of(EntityId.generate(), 100).equals(Order.of(EntityId.generate(), 100))).toBe(
      false,
    )
  })

  it('is not equal to another class sharing its id', () => {
    const id = EntityId.generate()

    expect(Order.of(id, 100).equals(Shipment.of(id, 100))).toBe(false)
  })
})

describe('AggregateRoot', () => {
  it('hands over recorded events and empties its buffer', () => {
    const cart = Cart.of(EntityId.generate())
    cart.place()
    cart.place()

    const first = cart.pullEvents()
    expect(first).toHaveLength(2)
    expect(first[0]?.name).toBe('order.placed')
    expect(first[0]?.aggregateId.equals(cart.id)).toBe(true)
    expect(first[0]?.occurredAt).toBeInstanceOf(Date)

    expect(cart.pullEvents()).toHaveLength(0)
  })

  it('starts with no events', () => {
    expect(Cart.of(EntityId.generate()).pullEvents()).toEqual([])
  })
})

describe('EntityId', () => {
  it('generates a version 7 uuid', () => {
    const id = EntityId.generate()

    expect(EntityId.isValid(id.value)).toBe(true)
    expect(id.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('generates ids that sort in creation order', () => {
    const ids = [EntityId.generate().value, EntityId.generate().value, EntityId.generate().value]

    expect([...ids].sort()).toEqual(ids)
  })

  it('parses a valid uuidv7 back into an id', () => {
    const original = EntityId.generate()
    const parsed = EntityId.parse(original.value)

    expect(parsed.isOk()).toBe(true)
    expect(parsed._unsafeUnwrap().equals(original)).toBe(true)
  })

  it.each([
    ['a v4 uuid', '9f8d1f4e-2b4a-4c1e-8b3f-2c9a1e7d4b55'],
    ['a nil uuid', '00000000-0000-0000-0000-000000000000'],
    ['not a uuid at all', 'order-42'],
    ['an empty string', ''],
  ])('rejects %s', (_label, value) => {
    const parsed = EntityId.parse(value)

    expect(parsed.isErr()).toBe(true)
    expect(parsed._unsafeUnwrapErr().code).toBe('VALIDATION_FAILED')
  })

  it('compares by value, not by instance', () => {
    const id = EntityId.generate()

    expect(id.equals(EntityId.parse(id.value)._unsafeUnwrap())).toBe(true)
    expect(id.equals(EntityId.generate())).toBe(false)
    expect(id.equals(null)).toBe(false)
  })
})
