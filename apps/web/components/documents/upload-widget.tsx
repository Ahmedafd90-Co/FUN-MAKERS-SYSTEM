'use client';

/**
 * Upload Widget — Task 1.6.12
 *
 * Drag-and-drop file upload dialog for documents.
 * Supports "create" (new document) and "supersede" (new version) modes.
 *
 * - Drag-and-drop zone or click-to-pick
 * - Shows file name, size, MIME type
 * - Title input + category dropdown (create mode)
 * - Reason field (supersede mode)
 * - 50 MB client-side size limit
 * - Loading spinner on submit
 * - Toast on success/error + redirect to document viewer on create
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
import { FileUp, Loader2, Upload, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@/lib/trpc-client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

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
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
  /**
   * Optional polymorphic link to a business record (IPA, IPC, Variation, ...).
   * When both are set on a `create`-mode upload, the new document is attached
   * to that record so it surfaces in the record's AttachmentsPanel.
   */
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [reason, setReason] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Reset form when dialog closes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setFile(null);
      setTitle('');
      setCategory('');
      setReason('');
      setUploading(false);
      setDragOver(false);
    }
    onOpenChange(open);
  };

  // ---------------------------------------------------------------------------
  // File selection handlers
  // ---------------------------------------------------------------------------

  const handleFileSelect = useCallback((selectedFile: File) => {
    if (selectedFile.size > MAX_FILE_SIZE) {
      toast.error(
        `File size (${formatFileSize(selectedFile.size)}) exceeds the 50 MB limit.`,
      );
      return;
    }
    setFile(selectedFile);

    // Auto-fill title from filename (strip extension) if empty
    if (!title) {
      const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '');
      setTitle(nameWithoutExt);
    }
  }, [title]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) handleFileSelect(selected);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFileSelect(dropped);
    },
    [handleFileSelect],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const removeFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ---------------------------------------------------------------------------
  // Upload submission
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
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', projectId);
      formData.append('mode', mode);

      if (mode === 'create') {
        formData.append('title', title.trim());
        formData.append('category', category);
        // Attach to a business record (e.g. IPA) if the caller provided the
        // polymorphic link. The API route forwards these into
        // `documentService.createDocument`.
        if (recordType) formData.append('recordType', recordType);
        if (recordId) formData.append('recordId', recordId);
      }

      if (mode === 'supersede') {
        formData.append('documentId', documentId!);
        formData.append('reason', reason.trim());
      }

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed.');
      }

      toast.success(result.message || 'Upload successful.');

      // Invalidate document queries
      utils.documents.list.invalidate();
      utils.documents.get.invalidate();

      handleOpenChange(false);

      // Navigate to the document viewer on create
      if (mode === 'create' && result.document?.id) {
        router.push(
          `/projects/${projectId}/documents/${result.document.id}`,
        );
      } else if (mode === 'supersede') {
        // Refresh the current page (viewer will refetch)
        router.refresh();
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred.';
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
          {/* Drag-and-drop zone */}
          {!file ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  fileInputRef.current?.click();
                }
              }}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`
                flex flex-col items-center justify-center gap-2
                rounded-lg border-2 border-dashed p-8 cursor-pointer
                transition-colors
                ${
                  dragOver
                    ? 'border-primary bg-primary/5'
                    : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                }
              `}
            >
              <Upload className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Drag and drop a file here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground/70">
                Maximum file size: 50 MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleInputChange}
              />
            </div>
          ) : (
            // File preview
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <FileUp className="h-8 w-8 text-muted-foreground/50 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(file.size)} -- {file.type || 'Unknown type'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 shrink-0"
                onClick={removeFile}
                disabled={uploading}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

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
                <Select
                  value={category}
                  onValueChange={setCategory}
                  disabled={uploading}
                >
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
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={uploading || !file}
          >
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
