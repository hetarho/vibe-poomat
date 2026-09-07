import { BetaModule } from '../../beta/beta.module'
import { Order } from '../domain/order'

/** Legal on purpose: application may reach its own domain and another context's module file. */
export class LegalUseCase {
  run(order: Order): string {
    return `${order.label()}:${BetaModule.name}`
  }
}
