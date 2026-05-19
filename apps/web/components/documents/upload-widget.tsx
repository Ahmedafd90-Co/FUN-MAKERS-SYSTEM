'use client';

/**
 * Upload Widget — Task 1.6.12
 *
 * Drag-and-drop file upload dialog for documents.
 * Supports "create" (new document) and "supersede" (new version) modes.
 *
 * - File picking via the shared FileUploadField component (PIC-51)
 * - Title input + category dropdown (create mode)
 * - Reason field (supersede mode)
 * - 50 MB client-side size limit (enforced by FileUploadField)
 * - Loading spinner on submit
 * - Toast on success/error + redirect to document viewer on create
 *
 * Refactored for PIC-51:
 *   - File-picker UI extracted to <FileUploadField> (apps/web/components/forms/)
 *     so Layer 2.5 entity forms (Drawing Register, DCM, Material Lifecycle)
 *     can embed the same primitive inline rather than reaching for a Dialog.
 *   - Upload submission extracted to `submitDocumentUpload` (apps/web/lib/)
 *     so the Dialog and inline forms share ONE upload path.
 *   - This file is now a thin Dialog wrapper composing those two pieces;
 *     external UX is unchanged.
 */

import { Button } from '@fmksa/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@fmksa/ui/components/dialog';
import { Input } from '@fmksa/ui/components/input';
import { Label } from '@fmksa/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fmksa/ui/components/select';
import { Textarea } from '@fmksa/ui/components/textarea';
import { FileUp, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { FileUploadField } from '@/components/forms/file-upload-field';
import { submitDocumentUpload } from '@/lib/document-upload';
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UploadWidgetProps = {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional: pre-fill for supersede mode */
  mode?: 'create' | 'supersede';
  documentId?: string;
  /** Optional: attach the new document to a specific record (polymorphic FK).
   *  When set in create mode, both fields are forwarded to /api/upload, which
   *  forwards to documentService.createDocument, which validates the record
   *  exists and is in the same project. */
  recordType?: string;
  recordId?: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UploadWidget({
  projectId,
  open,
  onOpenChange,
  mode = 'create',
  documentId,
  recordType,
  recordId,
}: UploadWidgetProps) {
  const router = useRouter();
  const utils = trpc.useUtils();

  // Form state
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [reason, setReason] = useState('');
  const [uploading, setUploading] = useState(false);

  // Reset form when dialog closes
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setFile(null);
      setTitle('');
      setCategory('');
      setReason('');
      setUploading(false);
    }
    onOpenChange(next);
  };

  // Auto-fill title from filename (strip extension) when a file is picked.
  const handleFileChange = (picked: File | null) => {
    setFile(picked);
    if (picked && !title) {
      const nameWithoutExt = picked.name.replace(/\.[^/.]+$/, '');
      setTitle(nameWithoutExt);
    }
  };

  // ---------------------------------------------------------------------------
  // Upload submission (routes through the shared submitDocumentUpload helper)
  // ---------------------------------------------------------------------------

  const handleSubmit = async () => {
    if (!file) {
      toast.error('Please select a file.');
      return;
    }

    if (mode === 'create') {
      if (!title.trim()) {
        toast.error('Please enter a document title.');
        return;
      }
      if (!category) {
        toast.error('Please select a category.');
        return;
      }
    }

    if (mode === 'supersede') {
      if (!reason.trim()) {
        toast.error('Please enter a reason for supersession.');
        return;
      }
      if (!documentId) {
        toast.error('No document ID provided for supersession.');
        return;
      }
    }

    setUploading(true);

    try {
      const result =
        mode === 'create'
          ? await submitDocumentUpload({
              mode: 'create',
              file,
              projectId,
              title: title.trim(),
              category,
              ...(recordType ? { recordType } : {}),
              ...(recordId ? { recordId } : {}),
            })
          : await submitDocumentUpload({
              mode: 'supersede',
              file,
              projectId,
              documentId: documentId!,
              reason: reason.trim(),
            });

      toast.success(result.message ?? 'Upload successful.');

      // Invalidate document queries
      utils.documents.list.invalidate();
      utils.documents.get.invalidate();

      handleOpenChange(false);

      // Navigate to the document viewer on create
      if (mode === 'create' && result.document?.id) {
        router.push(`/projects/${projectId}/documents/${result.document.id}`);
      } else if (mode === 'supersede') {
        // Refresh the current page (viewer will refetch)
        router.refresh();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'supersede' ? 'Upload New Version' : 'Upload Document'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'supersede'
              ? 'Upload a new file to supersede the current version.'
              : 'Upload a document to the project library.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* File picker — shared component reused by Layer 2.5 entity forms */}
          <FileUploadField value={file} onChange={handleFileChange} disabled={uploading} />

          {/* Create mode: title + category */}
          {mode === 'create' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="doc-title">Title</Label>
                <Input
                  id="doc-title"
                  placeholder="Enter document title..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={uploading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc-category">Category</Label>
                <Select value={category} onValueChange={setCategory} disabled={uploading}>
                  <SelectTrigger id="doc-category">
                    <SelectValue placeholder="Select a category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Supersede mode: reason */}
          {mode === 'supersede' && (
            <div className="space-y-1.5">
              <Label htmlFor="supersede-reason">
                Reason for new version <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="supersede-reason"
                placeholder="Describe why this version is being superseded..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={uploading}
                rows={3}
              />
            </div>
          )}

          {/* Submit button */}
          <Button className="w-full" onClick={handleSubmit} disabled={uploading || !file}>
            {uploading ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <FileUp className="mr-1.5 h-4 w-4" />
                {mode === 'supersede' ? 'Upload New Version' : 'Upload Document'}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
