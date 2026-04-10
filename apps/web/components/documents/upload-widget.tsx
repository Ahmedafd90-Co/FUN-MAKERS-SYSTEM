'use client';

/**
 * Upload Widget — Task 1.6.12 (stub created in 1.6.10 for imports)
 *
 * Full implementation will add drag-and-drop, progress, and validation.
 * This stub provides the dialog shell so the document list and workspace
 * tabs can import it without errors.
 */

import { Button } from '@fmksa/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@fmksa/ui/components/dialog';

type UploadWidgetProps = {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional: pre-fill for supersede mode */
  mode?: 'create' | 'supersede';
  documentId?: string;
};

export function UploadWidget({
  projectId,
  open,
  onOpenChange,
  mode = 'create',
  documentId,
}: UploadWidgetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
        <p className="text-sm text-muted-foreground py-4 text-center">
          Upload widget loading...
        </p>
      </DialogContent>
    </Dialog>
  );
}
