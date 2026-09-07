// violates fsd/no-public-api-sidestep: reaches past the slice's index.ts
import { UserCard } from '../../../entities/user/ui/user-card'

export function Profile() {
  return <UserCard />
}
