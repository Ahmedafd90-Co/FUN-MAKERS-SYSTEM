import { prisma } from '@fmksa/db';
import { auditService } from '../audit/service';
import { createDocument } from './create';
import { uploadVersion } from './versions';
import { listDocuments } from './list';
import { signVersion } from './signatures';
import { supersedeVersion } from './supersede';
import { getDocument } from './get';

// ---------------------------------------------------------------------------
// Document Service — aggregate object collecting all document methods
// ---------------------------------------------------------------------------

export const documentService = {
  createDocument,
  uploadVersion,
  listDocuments,
  signVersion,
  supersedeVersion,
  getDocument,
};
