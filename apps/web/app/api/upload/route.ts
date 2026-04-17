/**
 * File Upload API Route — Task 1.6.9
 *
 * Handles multipart/form-data file uploads for documents.
 * tRPC does not support file uploads natively, so we use a Next.js API route.
 *
 * Supports two modes:
 *  1. "create" — Create a new document AND upload its first version in one call.
 *     Required fields: projectId, title, category, file
 *
 *  2. "supersede" — Upload a new version that supersedes the current one.
 *     Required fields: projectId, documentId, reason, file
 *
 * Auth: Reads session from cookie via Auth.js.
 * Permissions: document.upload (create) or document.supersede (supersede).
 * Storage: File goes to MinIO via the storage adapter.
 * Integrity: SHA-256 hash is computed and stored with the version.
 */
import {
  documentService,
  accessControlService,
  assertProjectScope,
} from '@fmksa/core';
import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';

import type { NextRequest } from 'next/server';

/** Max file size: 50 MB */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

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
    const mode = (formData.get('mode') as string) || 'create';

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

    // ------------------------------------------------------------------
    // 3. Validate file size
    // ------------------------------------------------------------------
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File size (${(file.size / 1024 / 1024).toFixed(1)} MB) exceeds the 50 MB limit.`,
        },
        { status: 400 },
      );
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // ------------------------------------------------------------------
    // 4. Route by mode
    // ------------------------------------------------------------------
    if (mode === 'supersede') {
      return handleSupersede({
        userId,
        projectId,
        fileBuffer,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        documentId: formData.get('documentId') as string | null,
        reason: formData.get('reason') as string | null,
      });
    }

    // Default: create mode
    return handleCreate({
      userId,
      projectId,
      fileBuffer,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      title: formData.get('title') as string | null,
      category: formData.get('category') as string | null,
      recordType: (formData.get('recordType') as string | null) || null,
      recordId: (formData.get('recordId') as string | null) || null,
    });
  } catch (error) {
    console.error('[upload] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error during upload.' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Create mode — new document + first version
// ---------------------------------------------------------------------------

async function handleCreate(params: {
  userId: string;
  projectId: string;
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  title: string | null;
  category: string | null;
  /**
   * Optional polymorphic link to a business record (IPA, IPC, Variation, ...).
   * When both are set, the new Document is attached to that record so it
   * appears in the record's AttachmentsPanel. Existing upload callers that
   * omit these fields continue to create project-scoped documents only.
   */
  recordType: string | null;
  recordId: string | null;
}) {
  const {
    userId,
    projectId,
    fileBuffer,
    fileName,
    mimeType,
    title,
    category,
    recordType,
    recordId,
  } = params;

  // Validate required fields
  if (!title || title.trim().length === 0) {
    return NextResponse.json(
      { error: 'title is required.' },
      { status: 400 },
    );
  }

  if (!category) {
    return NextResponse.json(
      { error: 'category is required.' },
      { status: 400 },
    );
  }

  // Permission check (also verifies project membership)
  try {
    await accessControlService.requirePermission(
      userId,
      'document.upload',
      projectId,
    );
  } catch {
    return NextResponse.json(
      { error: 'You do not have permission to upload documents.' },
      { status: 403 },
    );
  }

  // Project membership check
  const isAssigned = await accessControlService.isAssignedToProject(userId, projectId);
  if (!isAssigned) {
    return NextResponse.json(
      { error: 'You are not assigned to this project.' },
      { status: 403 },
    );
  }

  // Create the document. Polymorphic record link is optional — when present,
  // the document becomes visible in that record's AttachmentsPanel.
  const document = await documentService.createDocument({
    projectId,
    title: title.trim(),
    category,
    createdBy: userId,
    ...(recordType ? { recordType } : {}),
    ...(recordId ? { recordId } : {}),
  });

  // Upload the first version
  const version = await documentService.uploadVersion({
    documentId: document.id,
    fileBuffer,
    fileName,
    mimeType,
    uploadedBy: userId,
  });

  return NextResponse.json({
    document,
    version,
    message: 'Document created and file uploaded successfully.',
  });
}

// ---------------------------------------------------------------------------
// Supersede mode — new version that replaces the current one
// ---------------------------------------------------------------------------

async function handleSupersede(params: {
  userId: string;
  projectId: string;
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  documentId: string | null;
  reason: string | null;
}) {
  const { userId, projectId, fileBuffer, fileName, mimeType, documentId, reason } =
    params;

  if (!documentId) {
    return NextResponse.json(
      { error: 'documentId is required for supersede mode.' },
      { status: 400 },
    );
  }

  if (!reason || reason.trim().length === 0) {
    return NextResponse.json(
      { error: 'reason is required for supersession.' },
      { status: 400 },
    );
  }

  // Permission check
  try {
    await accessControlService.requirePermission(
      userId,
      'document.supersede',
      projectId,
    );
  } catch {
    return NextResponse.json(
      { error: 'You do not have permission to supersede documents.' },
      { status: 403 },
    );
  }

  // Project membership check
  const isAssigned = await accessControlService.isAssignedToProject(userId, projectId);
  if (!isAssigned) {
    return NextResponse.json(
      { error: 'You are not assigned to this project.' },
      { status: 403 },
    );
  }

  // Verify document belongs to this project (scope binding)
  const doc = await documentService.getDocument(documentId, userId);
  if (doc.projectId !== projectId) {
    return NextResponse.json(
      { error: 'Document not found.' },
      { status: 404 },
    );
  }

  // Supersede the current version
  const result = await documentService.supersedeVersion({
    documentId,
    fileBuffer,
    fileName,
    mimeType,
    uploadedBy: userId,
    reason: reason.trim(),
  });

  return NextResponse.json({
    oldVersion: result.oldVersion,
    newVersion: result.newVersion,
    message: 'Document version superseded successfully.',
  });
}
