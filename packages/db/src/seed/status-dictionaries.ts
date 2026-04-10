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
 * All four dictionaries filled by Ahmed Al-Dossary on 2026-04-10 (Pause #5).
 * Intent notes applied:
 *   - approved_with_comments is distinct from clean approved (both exist)
 *   - not_required is terminal for shop_drawing and testing_certification only
 *   - received_and_inspected is NOT the same as closed (both exist in fabrication)
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

  // === shop_drawing (filled by Ahmed, 2026-04-10, Pause #5) ===
  // Note: not_required IS terminal for shop drawings. approved_with_comments is distinct from approved.
  { dictionaryCode: 'shop_drawing', statusCode: 'not_required', label: 'Not Required', orderIndex: 10, colorHint: 'gray', isTerminal: true },
  { dictionaryCode: 'shop_drawing', statusCode: 'required', label: 'Required', orderIndex: 20, colorHint: 'blue', isTerminal: false },
  { dictionaryCode: 'shop_drawing', statusCode: 'uploaded', label: 'Uploaded', orderIndex: 30, colorHint: 'blue', isTerminal: false },
  { dictionaryCode: 'shop_drawing', statusCode: 'under_review', label: 'Under Review', orderIndex: 40, colorHint: 'blue', isTerminal: false },
  { dictionaryCode: 'shop_drawing', statusCode: 'rejected', label: 'Rejected', orderIndex: 50, colorHint: 'red', isTerminal: false },
  { dictionaryCode: 'shop_drawing', statusCode: 'approved', label: 'Approved', orderIndex: 60, colorHint: 'green', isTerminal: true },
  { dictionaryCode: 'shop_drawing', statusCode: 'approved_with_comments', label: 'Approved with Comments', orderIndex: 65, colorHint: 'green', isTerminal: true },
  { dictionaryCode: 'shop_drawing', statusCode: 'resubmitted', label: 'Resubmitted', orderIndex: 70, colorHint: 'amber', isTerminal: false },

  // === fabrication_delivery (filled by Ahmed, 2026-04-10, Pause #5) ===
  // Note: received_and_inspected is NOT the same as closed. Both exist separately.
  { dictionaryCode: 'fabrication_delivery', statusCode: 'material_request_raised', label: 'Material Request Raised', orderIndex: 10, colorHint: 'gray', isTerminal: false },
  { dictionaryCode: 'fabrication_delivery', statusCode: 'quotation_requested', label: 'Quotation Requested', orderIndex: 20, colorHint: 'blue', isTerminal: false },
  { dictionaryCode: 'fabrication_delivery', statusCode: 'vendor_identified', label: 'Vendor Identified', orderIndex: 30, colorHint: 'blue', isTerminal: false },
  { dictionaryCode: 'fabrication_delivery', statusCode: 'technical_review_complete', label: 'Technical Review Complete', orderIndex: 40, colorHint: 'blue', isTerminal: false },
  { dictionaryCode: 'fabrication_delivery', statusCode: 'commercial_review_complete', label: 'Commercial Review Complete', orderIndex: 50, colorHint: 'blue', isTerminal: false },
  { dictionaryCode: 'fabrication_delivery', statusCode: 'po_award_ready', label: 'PO / Award Ready', orderIndex: 60, colorHint: 'blue', isTerminal: false },
  { dictionaryCode: 'fabrication_delivery', statusCode: 'fabrication_not_started', label: 'Fabrication Not Started', orderIndex: 70, colorHint: 'gray', isTerminal: false },
  { dictionaryCode: 'fabrication_delivery', statusCode: 'fabrication_in_progress', label: 'Fabrication In Progress', orderIndex: 80, colorHint: 'blue', isTerminal: false },
  { dictionaryCode: 'fabrication_delivery', statusCode: 'fabrication_complete', label: 'Fabrication Complete', orderIndex: 90, colorHint: 'green', isTerminal: false },
  { dictionaryCode: 'fabrication_delivery', statusCode: 'delivery_scheduled', label: 'Delivery Scheduled', orderIndex: 100, colorHint: 'blue', isTerminal: false },
  { dictionaryCode: 'fabrication_delivery', statusCode: 'in_transit', label: 'In Transit', orderIndex: 110, colorHint: 'blue', isTerminal: false },
  { dictionaryCode: 'fabrication_delivery', statusCode: 'delivered_to_site', label: 'Delivered to Site', orderIndex: 120, colorHint: 'green', isTerminal: false },
  { dictionaryCode: 'fabrication_delivery', statusCode: 'partially_delivered', label: 'Partially Delivered', orderIndex: 125, colorHint: 'amber', isTerminal: false },
  { dictionaryCode: 'fabrication_delivery', statusCode: 'received_and_inspected', label: 'Received and Inspected', orderIndex: 130, colorHint: 'green', isTerminal: false },
  { dictionaryCode: 'fabrication_delivery', statusCode: 'closed', label: 'Closed', orderIndex: 140, colorHint: 'darkgreen', isTerminal: true },

  // === testing_certification (filled by Ahmed, 2026-04-10, Pause #5) ===
  // Note: not_required IS terminal for testing. test_failed is not terminal (retest path exists).
  { dictionaryCode: 'testing_certification', statusCode: 'not_required', label: 'Not Required', orderIndex: 10, colorHint: 'gray', isTerminal: true },
  { dictionaryCode: 'testing_certification', statusCode: 'required', label: 'Required', orderIndex: 20, colorHint: 'blue', isTerminal: false },
  { dictionaryCode: 'testing_certification', statusCode: 'testing_requested', label: 'Testing Requested', orderIndex: 30, colorHint: 'blue', isTerminal: false },
  { dictionaryCode: 'testing_certification', statusCode: 'lab_appointment_scheduled', label: 'Lab Appointment Scheduled', orderIndex: 40, colorHint: 'blue', isTerminal: false },
  { dictionaryCode: 'testing_certification', statusCode: 'sample_submitted', label: 'Sample Submitted', orderIndex: 50, colorHint: 'blue', isTerminal: false },
  { dictionaryCode: 'testing_certification', statusCode: 'test_in_progress', label: 'Test In Progress', orderIndex: 60, colorHint: 'blue', isTerminal: false },
  { dictionaryCode: 'testing_certification', statusCode: 'test_passed', label: 'Test Passed', orderIndex: 70, colorHint: 'green', isTerminal: false },
  { dictionaryCode: 'testing_certification', statusCode: 'test_failed', label: 'Test Failed', orderIndex: 75, colorHint: 'red', isTerminal: false },
  { dictionaryCode: 'testing_certification', statusCode: 'retest_required', label: 'Retest Required', orderIndex: 80, colorHint: 'amber', isTerminal: false },
  { dictionaryCode: 'testing_certification', statusCode: 'certification_pending', label: 'Certification Pending', orderIndex: 90, colorHint: 'blue', isTerminal: false },
  { dictionaryCode: 'testing_certification', statusCode: 'certification_received', label: 'Certification Received', orderIndex: 100, colorHint: 'darkgreen', isTerminal: true },
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
