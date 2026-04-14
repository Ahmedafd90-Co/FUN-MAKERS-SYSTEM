'use client';

/**
 * My Approvals page — shows pending workflow approvals for the current user.
 * Task 1.5.11
 */

import { ApprovalList } from '@/components/approvals/approval-list';

export default function ApprovalsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 lg:px-8">
      <ApprovalList />
    </div>
  );
}
