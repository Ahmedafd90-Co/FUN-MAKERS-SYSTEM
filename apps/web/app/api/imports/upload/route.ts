/**
 * Sheet Import Upload API Route.
 *
 * Handles multipart/form-data for XLSX/XLSM/XLS uploads into the sheet-import
 * staging layer. tRPC does not handle binary uploads natively, so this REST
 * route is the entry point. After parsing the file, it defers to
 * `stageBatch()` in core, which writes ImportBatch + ImportRow records and
 * never touches live state.
 *
 * Required form fields:
 *   - projectId   (uuid)
 *   - importType  ('budget_baseline' | 'ipa_history')
 *   - file        (xlsx/xlsm/xls binary)
 *
 * Permissions:
 *   - import.create (or system.admin)
 *   - Must be assigned to the target project.
 *
 * Response:
 *   - 200  { batchId, totalRows, sourceFileHash }
 *   - 400  invalid input
 *   - 403  forbidden
 *   - 409  duplicate upload (same file hash for this project + type)
 *   - 500  unexpected
 */
import {
  accessControlService,
  stageBatch,
  DuplicateImportError,
} from '@fmksa/core';
import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';

import type { NextRequest } from 'next/server';

/** 25 MB — sheets rarely exceed this and we want to reject absurd uploads. */
const MAX_FILE_SIZE = 25 * 1024 * 1024;

const ALLOWED_IMPORT_TYPES = new Set(['budget_baseline', 'ipa_history']);

const ALLOWED_EXTENSIONS = /\.(xlsx|xlsm|xls)$/i;

export async function POST(request: NextRequest) {
  try {
    // ------------------------------------------------------------------
    // 1. Authenticate
    // ------------------------------------------------------------------
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 },
      );
    }
    const userId = session.user.id;

    // ------------------------------------------------------------------
    // 2. Parse multipart form data
    // ------------------------------------------------------------------
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const projectId = formData.get('projectId') as string | null;
    const importType = formData.get('importType') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided.' },
        { status: 400 },
      );
    }
    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required.' },
        { status: 400 },
      );
    }
    if (!importType || !ALLOWED_IMPORT_TYPES.has(importType)) {
      return NextResponse.json(
        {
          error: `importType must be one of: ${Array.from(ALLOWED_IMPORT_TYPES).join(', ')}.`,
        },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------
    // 3. Validate file
    // ------------------------------------------------------------------
    if (!ALLOWED_EXTENSIONS.test(file.name)) {
      return NextResponse.json(
        { error: 'File must be .xlsx, .xlsm, or .xls.' },
        { status: 400 },
      );
    }
    if (file.size === 0) {
      return NextResponse.json(
        { error: 'File is empty.' },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File size (${(file.size / 1024 / 1024).toFixed(1)} MB) exceeds the 25 MB limit.`,
        },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------
    // 4. Permission + project scope
    // ------------------------------------------------------------------
    try {
      await accessControlService.requirePermission(
        userId,
        'import.create',
        projectId,
      );
    } catch {
      return NextResponse.json(
        { error: 'You do not have permission to upload sheet imports.' },
        { status: 403 },
      );
    }

    const isAssigned = await accessControlService.isAssignedToProject(
      userId,
      projectId,
    );
    if (!isAssigned) {
      return NextResponse.json(
        { error: 'You are not assigned to this project.' },
        { status: 403 },
      );
    }

    // ------------------------------------------------------------------
    // 5. Stage the batch
    // ------------------------------------------------------------------
    const arrayBuffer = await file.arrayBuffer();
    const fileBytes = Buffer.from(arrayBuffer);

    try {
      const result = await stageBatch({
        projectId,
        importType: importType as 'budget_baseline' | 'ipa_history',
        sourceFileName: file.name,
        fileBytes,
        actorUserId: userId,
      });
      return NextResponse.json({
        batchId: result.batchId,
        totalRows: result.totalRows,
        sourceFileHash: result.sourceFileHash,
        message: 'Batch staged. Open the Imports review queue to validate.',
      });
    } catch (err) {
      if (err instanceof DuplicateImportError) {
        return NextResponse.json(
          {
            error: err.message,
            existingBatchId: err.existingBatchId,
            sourceFileHash: err.sourceFileHash,
          },
          { status: 409 },
        );
      }
      if (err instanceof Error) {
        // Parser / shape errors are user-visible — expose the message.
        return NextResponse.json(
          { error: err.message },
          { status: 400 },
        );
      }
      throw err;
    }
  } catch (error) {
    console.error('[imports/upload] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error during import upload.' },
      { status: 500 },
    );
  }
}
