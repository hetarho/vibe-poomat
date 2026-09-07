import { Injectable } from '@nestjs/common'
import { OrderRepository } from '../infrastructure/order-repository'

// violates domain-imports-inward-only and pure-layers-are-framework-free
@Injectable()
export class Order {
  constructor(private readonly repository: OrderRepository) {}

  label(): string {
    return this.repository.find()
  }
}
