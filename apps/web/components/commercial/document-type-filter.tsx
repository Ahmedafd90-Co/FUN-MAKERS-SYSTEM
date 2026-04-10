'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@fmksa/ui/components/select';

const CATEGORIES = [
  { value: 'all', label: 'All Types' },
  { value: 'documents', label: 'Documents (PDF/Word)' },
  { value: 'images', label: 'Images (PNG/JPG)' },
  { value: 'spreadsheets', label: 'Spreadsheets (XLS/CSV)' },
];

const MIME_MAP: Record<string, string[]> = {
  documents: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  images: ['image/png', 'image/jpeg', 'image/svg+xml', 'image/gif'],
  spreadsheets: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'],
};

export function DocumentTypeFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-48 h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CATEGORIES.map(c => (
          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function filterByDocumentType<T extends { mimeType?: string | null }>(items: T[], category: string): T[] {
  if (category === 'all') return items;
  const allowed = MIME_MAP[category];
  if (!allowed) return items;
  return items.filter(item => item.mimeType && allowed.includes(item.mimeType));
}
