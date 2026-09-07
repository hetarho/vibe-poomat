import { Customer } from '../../beta/domain/customer'

export class OrderController {
  // violates no-cross-context-deep-import
  read(): string {
    return new Customer().label()
  }
}
