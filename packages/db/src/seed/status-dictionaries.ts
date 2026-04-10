import type { PrismaClient } from '@prisma/client';

type StatusDictEntry = {
  dictionaryCode: string;
  statusCode: string;
  label: string;
  orderIndex: number;
  colorHint: string;
  isTerminal: boolean;
};

/**
 * Configurable status dictionaries for Pico Play Fun Makers KSA.
 *
 * These power the status chips and filters on M3+ trackers (materials,
 * shop drawings, fabrication, testing, notices, claims). Defining them
 * now means later modules read from one source of truth instead of
 * hardcoding strings.
 *
 * The example below (material_request_review) is fully worked. The
 * remaining dictionaries are marked with TODO(ahmed) for Ahmed to fill
 * in with the canonical status vocabularies from his domain knowledge.
 */
export const STATUS_DICTIONARIES: StatusDictEntry[] = [
  // === material_request_review (fully worked example) ===
  { dictionaryCode: 'material_request_review', statusCode: 'draft', label: 'Draft', orderIndex: 10, colorHint: 'gray', isTerminal: false },
  { dictionaryCode: 'material_request_review', statusCode: 'submitted_by_site', label: 'Submitted by Site', orderIndex: 20, colorHint: 'blue', isTerminal: false },
  { dictionaryCode: 'material_request_review', statusCode: 'under_pm_review', label: 'Under PM Review', orderIndex: 30, colorHint: 'blue', isTerminal: false },
  { dictionaryCode: 'material_request_review', statusCode: 'under_procurement_review', label: 'Under Procurement Review', orderIndex: 40, colorHint: 'blue', isTerminal: false },
  { dictionaryCode: 'material_request_review', statusCode: 'under_design_review', label: 'Under Design Review', orderIndex: 50, colorHint: 'blue', isTerminal: false },
  { dictionaryCode: 'material_request_review', statusCode: 'under_qaqc_review', label: 'Under QA/QC Review', orderIndex: 60, colorHint: 'blue', isTerminal: false },
  { dictionaryCode: 'material_request_review', statusCode: 'returned_for_correction', label: 'Returned for Correction', orderIndex: 70, colorHint: 'amber', isTerminal: false },
  { dictionaryCode: 'material_request_review', statusCode: 'rejected', label: 'Rejected', orderIndex: 80, colorHint: 'red', isTerminal: true },
  { dictionaryCode: 'material_request_review', statusCode: 'approved', label: 'Approved', orderIndex: 90, colorHint: 'green', isTerminal: true },
  { dictionaryCode: 'material_request_review', statusCode: 'approved_with_comments', label: 'Approved with Comments', orderIndex: 95, colorHint: 'green', isTerminal: true },

  // TODO(ahmed): shop_drawing
  // Suggested statuses: Not Required, Required, Uploaded, Under Review,
  //   Rejected, Approved, Approved with Comments, Resubmitted
  // Copy the pattern above. Each entry needs:
  //   dictionaryCode: 'shop_drawing'
  //   statusCode, label, orderIndex (10, 20, 30...), colorHint, isTerminal

  // TODO(ahmed): fabrication_delivery
  // Suggested statuses: Material Request Raised, PO Issued, In Fabrication,
  //   Ready for Dispatch, In Transit, Delivered to Site, Inspected, Rejected,
  //   Accepted, Closed
  // dictionaryCode: 'fabrication_delivery'

  // TODO(ahmed): testing_certification
  // Suggested statuses: Not Required, Required, Sample Submitted,
  //   Testing in Progress, Test Failed, Test Passed,
  //   Certification Requested, Certification Received
  // dictionaryCode: 'testing_certification'
];

export async function seedStatusDictionaries(prisma: PrismaClient) {
  console.log('  Seeding status dictionaries...');
  for (const s of STATUS_DICTIONARIES) {
    await prisma.statusDictionary.upsert({
      where: {
        dictionaryCode_statusCode: {
          dictionaryCode: s.dictionaryCode,
          statusCode: s.statusCode,
        },
      },
      create: {
        dictionaryCode: s.dictionaryCode,
        statusCode: s.statusCode,
        label: s.label,
        orderIndex: s.orderIndex,
        colorHint: s.colorHint,
        isTerminal: s.isTerminal,
      },
      update: {
        label: s.label,
        orderIndex: s.orderIndex,
        colorHint: s.colorHint,
        isTerminal: s.isTerminal,
      },
    });
  }
  console.log(`  ✓ ${STATUS_DICTIONARIES.length} status dictionary entries seeded`);
}
