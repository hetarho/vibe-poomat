// violates fsd/forbidden-imports: entities may not reach up into features
import { EditUserForm } from '../../../features/edit-user'

export function UserCard() {
  return (
    <div>
      <EditUserForm />
    </div>
  )
}
