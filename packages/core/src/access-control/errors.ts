/**
 * Custom error for permission denial.
 *
 * Thrown by `requirePermission` when the calling user lacks a required
 * permission code.  Downstream layers (tRPC error formatter, REST
 * middleware) can inspect `code`, `permissionCode` and `projectId` to
 * build a structured client response.
 */
export class PermissionDeniedError extends Error {
  readonly code = 'PERMISSION_DENIED' as const;
  readonly permissionCode: string;
  readonly projectId?: string | undefined;

  constructor(opts: { permissionCode: string; projectId?: string | undefined }) {
    super(
      `Permission denied: ${opts.permissionCode}` +
        (opts.projectId ? ` (project ${opts.projectId})` : ''),
    );
    this.name = 'PermissionDeniedError';
    this.permissionCode = opts.permissionCode;
    this.projectId = opts.projectId;
  }
}
