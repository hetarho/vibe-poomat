import { OrderController } from '../presentation/order.controller'

// violates application-imports-inward-only
export class PlaceOrderUseCase {
  run(): string {
    return new OrderController().read()
  }
}
