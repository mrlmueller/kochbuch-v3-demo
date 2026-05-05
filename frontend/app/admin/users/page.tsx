import { getAdminUsers } from '@/lib/api.server'
import { AdminUserList } from '@/components/admin/user-list'

export default async function UsersPage() {
  const users = await getAdminUsers()
  return <AdminUserList users={users} />
}
