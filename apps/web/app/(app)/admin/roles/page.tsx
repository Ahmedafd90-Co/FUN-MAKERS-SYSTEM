import { RoleList } from '@/components/admin/role-list';
import { RolePermissionMatrix } from '@/components/admin/role-permission-matrix';

export default function AdminRolesPage() {
  return (
    <>
      <RoleList />
      <RolePermissionMatrix />
    </>
  );
}
