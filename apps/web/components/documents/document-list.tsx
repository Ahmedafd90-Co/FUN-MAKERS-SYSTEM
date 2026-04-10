'use client';

/**
 * Document Library — Task 1.6.10
 *
 * Displays project documents in a filterable, paginated table.
 * Columns: title, category, status, version, size, uploaded by, uploaded at.
 * Sorted by most recently updated (createdAt desc from API).
 */

import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import { Input } from '@fmksa/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fmksa/ui/components/select';
import { ChevronLeft, ChevronRight, FileUp, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { trpc } from '@/lib/trpc-client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { value: 'shop_drawing', label: 'Shop Drawing' },
  { value: 'material_submittal', label: 'Material Submittal' },
  { value: 'test_certificate', label: 'Test Certificate' },
  { value: 'contract_attachment', label: 'Contract Attachment' },
  { value: 'vendor_document', label: 'Vendor Document' },
  { value: 'letter', label: 'Letter' },
  { value: 'drawing', label: 'Drawing' },
  { value: 'specification', label: 'Specification' },
  { value: 'general', label: 'General' },
] as const;

const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'in_review', label: 'In Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'signed', label: 'Signed' },
  { value: 'superseded', label: 'Superseded' },
  { value: 'archived', label: 'Archived' },
] as const;

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function categoryLabel(category: string): string {
  return (
    CATEGORIES.find((c) => c.value === category)?.label ?? category
  );
}

function statusBadge(status: string) {
  switch (status) {
    case 'draft':
      return (
        <Badge variant="secondary" className="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          Draft
        </Badge>
      );
    case 'in_review':
      return (
        <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
          In Review
        </Badge>
      );
    case 'approved':
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200">
          Approved
        </Badge>
      );
    case 'signed':
      return (
        <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
          Signed
        </Badge>
      );
    case 'superseded':
      return (
        <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200">
          Superseded
        </Badge>
      );
    case 'archived':
      return (
        <Badge variant="secondary" className="bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          Archived
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function categoryBadge(category: string) {
  return (
    <Badge variant="outline" className="font-normal">
      {categoryLabel(category)}
    </Badge>
  );
}

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes === 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type DocumentListProps = {
  projectId: string;
  onUploadClick: () => void;
};

export function DocumentList({ projectId, onUploadClick }: DocumentListProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const { data, isLoading, error } = trpc.documents.list.useQuery({
    projectId,
    ...(categoryFilter !== 'all' ? { category: categoryFilter as typeof CATEGORIES[number]['value'] } : {}),
    ...(statusFilter !== 'all' ? { status: statusFilter as typeof STATUSES[number]['value'] } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
    skip: page * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Documents</h2>
          <p className="text-sm text-muted-foreground">
            Project document library. Upload, review, and sign documents.
          </p>
        </div>
        <Button onClick={onUploadClick} size="sm">
          <FileUp className="mr-1.5 h-4 w-4" />
          Upload Document
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by title..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={categoryFilter}
          onValueChange={(v) => {
            setCategoryFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Title
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Category
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Version
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Size
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Uploaded
              </th>
            </tr>
          </thead>
          <tbody>
            <DocumentTableBody
              projectId={projectId}
              items={data?.items}
              isLoading={isLoading}
              error={error}
            />
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}--
            {Math.min((page + 1) * PAGE_SIZE, data?.total ?? 0)} of{' '}
            {data?.total ?? 0}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table body
// ---------------------------------------------------------------------------

type DocumentItem = {
  id: string;
  title: string;
  category: string;
  status: string;
  createdAt: Date | string;
  currentVersion: {
    versionNo: number;
    fileSize: number;
    uploadedAt: Date | string;
  } | null;
};

function DocumentTableBody({
  projectId,
  items,
  isLoading,
  error,
}: {
  projectId: string;
  items: DocumentItem[] | undefined;
  isLoading: boolean;
  error: { message: string } | null;
}) {
  if (isLoading) {
    return (
      <tr>
        <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
          Loading documents...
        </td>
      </tr>
    );
  }

  if (error) {
    return (
      <tr>
        <td colSpan={6} className="px-4 py-12 text-center text-destructive">
          {error.message}
        </td>
      </tr>
    );
  }

  if (!items || items.length === 0) {
    return (
      <tr>
        <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
          No documents in this project yet. Upload your first document to get
          started.
        </td>
      </tr>
    );
  }

  return (
    <>
      {items.map((doc) => (
        <tr
          key={doc.id}
          className="border-b last:border-0 hover:bg-muted/30 transition-colors"
        >
          <td className="px-4 py-3">
            <Link
              href={`/projects/${projectId}/documents/${doc.id}`}
              className="font-medium text-foreground hover:underline"
            >
              {doc.title}
            </Link>
          </td>
          <td className="px-4 py-3">{categoryBadge(doc.category)}</td>
          <td className="px-4 py-3">{statusBadge(doc.status)}</td>
          <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
            {doc.currentVersion ? `v${doc.currentVersion.versionNo}` : '-'}
          </td>
          <td className="px-4 py-3 text-muted-foreground text-xs">
            {formatFileSize(doc.currentVersion?.fileSize)}
          </td>
          <td className="px-4 py-3 text-muted-foreground text-xs">
            {formatDate(doc.currentVersion?.uploadedAt ?? doc.createdAt)}
          </td>
        </tr>
      ))}
    </>
  );
}
