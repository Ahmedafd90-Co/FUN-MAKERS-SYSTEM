'use client';

/**
 * FileUploadField — form-embeddable file picker (PIC-51).
 *
 * A controlled component for embedding file selection inline in a form
 * (Drawing Register create, Design Change Management, Material Lifecycle
 * stages, etc.). Stateless about the actual upload submission — parent
 * forms own the submit handler and call `submitDocumentUpload` (from
 * `@/lib/document-upload`) themselves, so there is exactly ONE upload
 * path through the application.
 *
 * Distinct from `<UploadWidget>` (a Dialog/modal wrapper around the same
 * primitives) — that surface is for standalone uploads from the documents
 * library page; this surface is for inline-form composition.
 *
 * Wiring with react-hook-form:
 *
 *   <Controller
 *     name="file"
 *     control={control}
 *     rules={{ required: 'File is required' }}
 *     render={({ field, fieldState }) => (
 *       <FileUploadField
 *         value={field.value}
 *         onChange={field.onChange}
 *         error={fieldState.error?.message}
 *       />
 *     )}
 *   />
 *
 * Or plain useState:
 *
 *   const [file, setFile] = useState<File | null>(null);
 *   <FileUploadField value={file} onChange={setFile} />
 */

import { Button } from '@fmksa/ui/components/button';
import { FileUp, Upload, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { checkFileSize, formatFileSize, MAX_UPLOAD_BYTES } from '@/lib/document-upload';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type FileUploadFieldProps = {
  /** Current file selection (controlled). */
  value: File | null;
  /** Called with the picked file, or null when the user removes the selection. */
  onChange: (file: File | null) => void;
  /** Maximum bytes. Defaults to MAX_UPLOAD_BYTES (50MB — matches the server path). */
  maxSizeBytes?: number;
  /** Optional `accept` filter for the underlying input (e.g. `application/pdf,image/*`). */
  accept?: string;
  /** Disable the picker (e.g. during form submission). */
  disabled?: boolean;
  /** Error message rendered below the picker (e.g. from react-hook-form). */
  error?: string | undefined;
  /** Optional id used for label binding. */
  id?: string;
  /** Optional class to compose with surrounding form layout. */
  className?: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FileUploadField({
  value,
  onChange,
  maxSizeBytes = MAX_UPLOAD_BYTES,
  accept,
  disabled = false,
  error,
  id,
  className,
}: FileUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [sizeError, setSizeError] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      const result = checkFileSize(file, maxSizeBytes);
      if (!result.ok) {
        setSizeError(
          `File size (${formatFileSize(result.actualBytes)}) exceeds the ${formatFileSize(result.limitBytes)} limit.`,
        );
        return;
      }
      setSizeError(null);
      onChange(file);
    },
    [onChange, maxSizeBytes],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) handleFile(selected);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFile(dropped);
    },
    [handleFile, disabled],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const removeFile = () => {
    onChange(null);
    setSizeError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const displayedError = sizeError ?? error;

  return (
    <div className={className}>
      {!value ? (
        <div
          id={id}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          onClick={() => !disabled && fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`
            flex flex-col items-center justify-center gap-2
            rounded-lg border-2 border-dashed p-8
            transition-colors
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
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
            Maximum file size: {formatFileSize(maxSizeBytes)}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleInputChange}
            disabled={disabled}
            {...(accept ? { accept } : {})}
          />
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <FileUp className="h-8 w-8 text-muted-foreground/50 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{value.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(value.size)} — {value.type || 'Unknown type'}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            onClick={removeFile}
            disabled={disabled}
            aria-label="Remove file"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {displayedError && (
        <p className="mt-1.5 text-xs text-destructive" role="alert">
          {displayedError}
        </p>
      )}
    </div>
  );
}
