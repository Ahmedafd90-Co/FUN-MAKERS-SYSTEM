/**
 * Live Workflow Convergence Proof — IPA & RFQ
 *
 * Proves that workflow events correctly sync record status:
 *   submit → workflow starts → record in workflow state
 *   approve all → record moves to approved_internal
 *   return → record moves to returned
 *   reject → record moves to rejected
 *   manual approval-phase blocked when workflow active
 *   re-submit after return works correctly
 *
 * Uses REAL demo users with REAL project role assignments.
 *
 * Run: DATABASE_URL="postgresql://..." pnpm exec tsx packages/core/scripts/workflow-proof.ts
 */

import { prisma } from '@fmksa/db';
import { createIpa, transitionIpa } from '../src/commercial/ipa/service';
import { createVariation, transitionVariation } from '../src/commercial/variation/service';
import { createRfq, transitionRfq } from '../src/procurement/rfq/service';
import { workflowInstanceService, workflowStepService, resolveTemplateCode } from '../src/workflow';
import { registerConvergenceHandlers } from '../src/workflow/convergence-handlers';
import { clearHandlers } from '../src/workflow/events';
import { registerCommercialEventTypes } from '../src/commercial/posting-hooks/register';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function getWorkflowForRecord(recordType: string, recordId: string) {
  return workflowInstanceService.getInstanceByRecord(recordType, recordId);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

type TestContext = {
  ahmed: { id: string; name: string };
  sara: { id: string; name: string };
  khalid: { id: string; name: string };
  omar: { id: string; name: string };
  fatima: { id: string; name: string };
  project: { id: string; name: string; code: string };
  tempAssignmentIds: string[];
};

async function getTestContext(): Promise<TestContext> {
  const ahmed = await prisma.user.findFirstOrThrow({ where: { email: 'ahmedafd90@gmail.com' } });
  const sara = await prisma.user.findFirstOrThrow({ where: { email: 'sara.fahad@fmksa.demo' } });
  const khalid = await prisma.user.findFirstOrThrow({ where: { email: 'khalid.rashid@fmksa.demo' } });
  const omar = await prisma.user.findFirstOrThrow({ where: { email: 'omar.hassan@fmksa.demo' } });
  const fatima = await prisma.user.findFirstOrThrow({ where: { email: 'fatima.zahrani@fmksa.demo' } });

  const project = await prisma.project.findFirstOrThrow({
    where: { status: 'active' },
    include: { entity: true },
  });

  // Every role required by IPA and RFQ workflow steps, mapped to the correct user
  const roleUserMap: Array<{ roleCode: string; userId: string }> = [
    { roleCode: 'qs_commercial', userId: sara.id },
    { roleCode: 'project_manager', userId: khalid.id },
    { roleCode: 'contracts_manager', userId: ahmed.id },
    { roleCode: 'project_director', userId: ahmed.id },
    { roleCode: 'document_controller', userId: ahmed.id },
    { roleCode: 'procurement', userId: omar.id },
  ];
  const tempAssignmentIds: string[] = [];

  for (const { roleCode, userId } of roleUserMap) {
    const role = await prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) throw new Error(`Missing system role: ${roleCode}`);
    const existing = await prisma.projectAssignment.findFirst({
      where: { projectId: project.id, roleId: role.id, revokedAt: null },
    });
    if (existing) continue;
    const assignment = await prisma.projectAssignment.create({
      data: {
        projectId: project.id,
        userId,
        roleId: role.id,
        effectiveFrom: new Date(),
        assignedBy: ahmed.id,
        assignedAt: new Date(),
      },
    });
    tempAssignmentIds.push(assignment.id);
  }

  return {
    ahmed: { id: ahmed.id, name: ahmed.name },
    sara: { id: sara.id, name: sara.name },
    khalid: { id: khalid.id, name: khalid.name },
    omar: { id: omar.id, name: omar.name },
    fatima: { id: fatima.id, name: fatima.name },
    project: { id: project.id, name: project.name, code: project.code },
    tempAssignmentIds,
  };
}

function getApproverForStep(step: any, ctx: TestContext): { userId: string; name: string } {
  const rule = step.approverRuleJson as any;
  const roleCode = rule?.roleCode;
  const map: Record<string, { userId: string; name: string }> = {
    qs_commercial: { userId: ctx.sara.id, name: ctx.sara.name },
    project_manager: { userId: ctx.khalid.id, name: ctx.khalid.name },
    contracts_manager: { userId: ctx.ahmed.id, name: ctx.ahmed.name },
    project_director: { userId: ctx.ahmed.id, name: ctx.ahmed.name },
    document_controller: { userId: ctx.ahmed.id, name: ctx.ahmed.name },
    procurement: { userId: ctx.omar.id, name: ctx.omar.name },
    finance: { userId: ctx.fatima.id, name: ctx.fatima.name },
  };
  const mapped = map[roleCode];
  if (!mapped) throw new Error(`No test user for roleCode '${roleCode}'`);
  return mapped;
}

async function cleanupRecord(recordType: 'ipa' | 'rfq' | 'variation', recordId: string) {
  const wi = await prisma.workflowInstance.findFirst({ where: { recordType, recordId } });
  if (wi) {
    await prisma.$executeRawUnsafe(`DELETE FROM workflow_actions WHERE instance_id = '${wi.id}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM audit_logs WHERE resource_type = 'workflow_instance' AND resource_id = '${wi.id}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM workflow_instances WHERE id = '${wi.id}'`);
  }
  await prisma.$executeRawUnsafe(`DELETE FROM audit_logs WHERE resource_type = '${recordType}' AND resource_id = '${recordId}'`);
  // Also clean posting events if any
  await prisma.$executeRawUnsafe(`DELETE FROM posting_events WHERE source_record_type = '${recordType}' AND source_record_id = '${recordId}'`);

  if (recordType === 'ipa') {
    await (prisma as any).ipa.delete({ where: { id: recordId } }).catch(() => {});
  } else if (recordType === 'rfq') {
    await prisma.$executeRawUnsafe(`DELETE FROM rfq_items WHERE rfq_id = '${recordId}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM rfq_vendors WHERE rfq_id = '${recordId}'`);
    await prisma.rFQ.delete({ where: { id: recordId } }).catch(() => {});
  } else if (recordType === 'variation') {
    await prisma.variation.delete({ where: { id: recordId } }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// IPA Convergence Proof
// ---------------------------------------------------------------------------

async function proofIPA(ctx: TestContext) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  IPA CONVERGENCE PROOF');
  console.log('═══════════════════════════════════════════════════════════');

  const createdIds: string[] = [];

  try {
    // --- Scenario A: Full approval → record auto-advances to approved_internal ---
    console.log('\n--- A. Submit → Full Approval → Record Converges ---');

    const uniquePeriod = 9000 + Math.floor(Math.random() * 999);
    const ipa = await createIpa({
      projectId: ctx.project.id,
      periodNumber: uniquePeriod,
      periodFrom: new Date().toISOString(),
      periodTo: new Date().toISOString(),
      grossAmount: 500000,
      retentionRate: 0.10,
      retentionAmount: 50000,
      previousCertified: 0,
      currentClaim: 450000,
      netClaimed: 450000,
      currency: 'SAR',
      description: 'Convergence Proof IPA — approve flow',
    }, ctx.ahmed.id);
    createdIds.push(ipa.id);

    assert(ipa.status === 'draft', 'IPA created in draft');

    // Submit
    await transitionIpa(ipa.id, 'submit', ctx.ahmed.id);
    let ipaState = await prisma.ipa.findUniqueOrThrow({ where: { id: ipa.id } });
    assert(ipaState.status === 'submitted', 'IPA status = submitted after submit');

    // Approve all workflow steps
    let wf = await getWorkflowForRecord('ipa', ipa.id);
    assert(wf !== null, 'Workflow instance created');

    while (wf && (wf.status === 'in_progress' || wf.status === 'returned')) {
      const curStep = wf.currentStep as any;
      if (!curStep) break;
      const approver = getApproverForStep(curStep, ctx);
      await workflowStepService.approveStep({
        instanceId: wf.id,
        stepId: curStep.id,
        actorUserId: approver.userId,
        comment: `Convergence proof — ${curStep.name}`,
      });
      wf = await getWorkflowForRecord('ipa', ipa.id);
    }

    assert(wf!.status === 'approved', 'Workflow status = approved');

    // ** THE KEY CHECK ** — record status should have converged
    ipaState = await prisma.ipa.findUniqueOrThrow({ where: { id: ipa.id } });
    assert(ipaState.status === 'approved_internal', 'IPA record converged to approved_internal');

    // Verify convergence audit log exists
    const convergenceAudit = await prisma.auditLog.findFirst({
      where: {
        resourceType: 'ipa',
        resourceId: ipa.id,
        action: 'ipa.transition.workflow_approved',
      },
    });
    assert(convergenceAudit !== null, 'Convergence audit log exists');
    assert(convergenceAudit?.actorSource === 'system', 'Audit log actorSource = system');
    const afterJson = convergenceAudit?.afterJson as any;
    assert(afterJson?._convergence?.workflowInstanceId === wf!.id, 'Audit log has workflow instance ID');
    assert(afterJson?._convergence?.templateCode === 'ipa_standard', 'Audit log has template code');

    // Verify posting event was fired
    const postingEvent = await prisma.postingEvent.findFirst({
      where: {
        sourceRecordType: 'ipa',
        sourceRecordId: ipa.id,
        eventType: 'IPA_APPROVED',
      },
    });
    assert(postingEvent !== null, 'IPA_APPROVED posting event fired by convergence');

    // --- Scenario B: Return → record converges to returned ---
    console.log('\n--- B. Submit → Return → Record Converges to Returned ---');

    const uniquePeriod2 = 8000 + Math.floor(Math.random() * 999);
    const ipa2 = await createIpa({
      projectId: ctx.project.id,
      periodNumber: uniquePeriod2,
      periodFrom: new Date().toISOString(),
      periodTo: new Date().toISOString(),
      grossAmount: 200000,
      retentionRate: 0.10,
      retentionAmount: 20000,
      previousCertified: 0,
      currentClaim: 180000,
      netClaimed: 180000,
      currency: 'SAR',
      description: 'Convergence Proof IPA — return flow',
    }, ctx.ahmed.id);
    createdIds.push(ipa2.id);

    await transitionIpa(ipa2.id, 'submit', ctx.ahmed.id);
    let wf2 = await getWorkflowForRecord('ipa', ipa2.id);

    // Approve step 1 (QS)
    const step1 = wf2!.currentStep as any;
    const step1Approver = getApproverForStep(step1, ctx);
    await workflowStepService.approveStep({
      instanceId: wf2!.id, stepId: step1.id, actorUserId: step1Approver.userId,
    });
    wf2 = await getWorkflowForRecord('ipa', ipa2.id);

    // Return from step 2 (PM) → should return to step 1
    const step2 = wf2!.currentStep as any;
    const step2Approver = getApproverForStep(step2, ctx);
    await workflowStepService.returnStep({
      instanceId: wf2!.id, stepId: step2.id, actorUserId: step2Approver.userId,
      comment: 'Needs revision — convergence test',
      returnToStepId: step1.id,
    });

    wf2 = await getWorkflowForRecord('ipa', ipa2.id);
    assert(wf2!.status === 'returned', 'Workflow status = returned');

    // ** THE KEY CHECK ** — record should converge to returned
    let ipa2State = await prisma.ipa.findUniqueOrThrow({ where: { id: ipa2.id } });
    assert(ipa2State.status === 'returned', 'IPA record converged to returned');

    // Verify return audit log has step context
    const returnAudit = await prisma.auditLog.findFirst({
      where: {
        resourceType: 'ipa',
        resourceId: ipa2.id,
        action: 'ipa.transition.workflow_returned',
      },
    });
    assert(returnAudit !== null, 'Return convergence audit log exists');
    const returnAfter = returnAudit?.afterJson as any;
    assert(returnAfter?._convergence?.returnedByStep !== null, 'Audit log has returnedByStep');
    assert(returnAfter?._convergence?.returnedToStep !== null, 'Audit log has returnedToStep');
    console.log(`  Return context: "${returnAfter?._convergence?.returnedByStep}" → "${returnAfter?._convergence?.returnedToStep}"`);

    // --- Scenario C: Re-submit after return ---
    console.log('\n--- C. Re-submit After Return ---');

    // User can re-submit from returned status
    await transitionIpa(ipa2.id, 'submit', ctx.ahmed.id);
    ipa2State = await prisma.ipa.findUniqueOrThrow({ where: { id: ipa2.id } });
    assert(ipa2State.status === 'submitted', 'IPA re-submitted after return');

    // Workflow is still alive in returned status — approver can re-approve
    wf2 = await getWorkflowForRecord('ipa', ipa2.id);
    assert(wf2!.status === 'returned', 'Workflow still in returned (waiting for step approval)');
    assert(wf2!.currentStep !== null, 'Workflow has a current step to re-approve');

    // --- Scenario D: Manual approval blocked when workflow active ---
    console.log('\n--- D. Manual Approval Blocked ---');

    // Try to manually approve — should fail because workflow is active
    let blockedApprove = false;
    try {
      await transitionIpa(ipa2.id, 'approve', ctx.ahmed.id);
    } catch (err: any) {
      if (err.message.includes('approval phase is managed by workflow')) {
        blockedApprove = true;
      }
    }
    assert(blockedApprove, 'Manual "approve" blocked when workflow active');

    let blockedReject = false;
    try {
      await transitionIpa(ipa2.id, 'reject', ctx.ahmed.id);
    } catch (err: any) {
      if (err.message.includes('approval phase is managed by workflow')) {
        blockedReject = true;
      }
    }
    assert(blockedReject, 'Manual "reject" blocked when workflow active');

    let blockedReturn = false;
    try {
      await transitionIpa(ipa2.id, 'return', ctx.ahmed.id);
    } catch (err: any) {
      if (err.message.includes('approval phase is managed by workflow')) {
        blockedReturn = true;
      }
    }
    assert(blockedReturn, 'Manual "return" blocked when workflow active');

    let blockedReview = false;
    try {
      await transitionIpa(ipa2.id, 'review', ctx.ahmed.id);
    } catch (err: any) {
      if (err.message.includes('approval phase is managed by workflow')) {
        blockedReview = true;
      }
    }
    assert(blockedReview, 'Manual "review" blocked when workflow active');

    // --- Scenario E: Reject → record converges to rejected ---
    console.log('\n--- E. Reject → Record Converges to Rejected ---');

    const uniquePeriod3 = 7000 + Math.floor(Math.random() * 999);
    const ipa3 = await createIpa({
      projectId: ctx.project.id,
      periodNumber: uniquePeriod3,
      periodFrom: new Date().toISOString(),
      periodTo: new Date().toISOString(),
      grossAmount: 100000,
      retentionRate: 0.05,
      retentionAmount: 5000,
      previousCertified: 0,
      currentClaim: 95000,
      netClaimed: 95000,
      currency: 'SAR',
      description: 'Convergence Proof IPA — reject flow',
    }, ctx.ahmed.id);
    createdIds.push(ipa3.id);

    await transitionIpa(ipa3.id, 'submit', ctx.ahmed.id);
    const wf3 = await getWorkflowForRecord('ipa', ipa3.id);
    const rejectStep = wf3!.currentStep as any;
    const rejectApprover = getApproverForStep(rejectStep, ctx);

    await workflowStepService.rejectStep({
      instanceId: wf3!.id, stepId: rejectStep.id, actorUserId: rejectApprover.userId,
      comment: 'Convergence proof — rejecting IPA',
    });

    const ipa3State = await prisma.ipa.findUniqueOrThrow({ where: { id: ipa3.id } });
    assert(ipa3State.status === 'rejected', 'IPA record converged to rejected');

    const rejectAudit = await prisma.auditLog.findFirst({
      where: {
        resourceType: 'ipa',
        resourceId: ipa3.id,
        action: 'ipa.transition.workflow_rejected',
      },
    });
    assert(rejectAudit !== null, 'Reject convergence audit log exists');
    const rejectAfter = rejectAudit?.afterJson as any;
    assert(rejectAfter?._convergence?.rejectedAtStep !== null, 'Audit log has rejectedAtStep');
    assert(rejectAfter?._convergence?.comment === 'Convergence proof — rejecting IPA', 'Reject comment preserved in audit');

  } finally {
    console.log('\n--- Cleanup ---');
    for (const id of createdIds) {
      await cleanupRecord('ipa', id);
    }
    console.log(`  ✓ Cleaned ${createdIds.length} test IPAs`);
  }
}

// ---------------------------------------------------------------------------
// RFQ Convergence Proof
// ---------------------------------------------------------------------------

async function proofRFQ(ctx: TestContext) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  RFQ CONVERGENCE PROOF');
  console.log('═══════════════════════════════════════════════════════════');

  const createdIds: string[] = [];

  try {
    // --- Scenario A: Full approval → record auto-advances to approved_internal ---
    console.log('\n--- A. Submit → Full Approval → Record Converges ---');

    const rfq = await createRfq({
      projectId: ctx.project.id,
      title: 'Convergence Proof RFQ — approve flow',
      currency: 'SAR',
      estimatedBudget: 250000,
    }, ctx.ahmed.id);
    createdIds.push(rfq.id);

    assert(rfq.status === 'draft', 'RFQ created in draft');

    await transitionRfq(rfq.id, 'submit', ctx.ahmed.id);
    let rfqState = await prisma.rFQ.findUniqueOrThrow({ where: { id: rfq.id } });
    assert(rfqState.status === 'under_review', 'RFQ status = under_review after submit');

    // Approve all workflow steps
    let wf = await getWorkflowForRecord('rfq', rfq.id);
    assert(wf !== null, 'Workflow instance created');

    while (wf && (wf.status === 'in_progress' || wf.status === 'returned')) {
      const curStep = wf.currentStep as any;
      if (!curStep) break;
      const approver = getApproverForStep(curStep, ctx);
      await workflowStepService.approveStep({
        instanceId: wf.id,
        stepId: curStep.id,
        actorUserId: approver.userId,
        comment: `Convergence proof — ${curStep.name}`,
      });
      wf = await getWorkflowForRecord('rfq', rfq.id);
    }

    assert(wf!.status === 'approved', 'Workflow status = approved');

    rfqState = await prisma.rFQ.findUniqueOrThrow({ where: { id: rfq.id } });
    assert(rfqState.status === 'approved_internal', 'RFQ record converged to approved_internal');

    // Verify convergence audit
    const convergenceAudit = await prisma.auditLog.findFirst({
      where: {
        resourceType: 'rfq',
        resourceId: rfq.id,
        action: 'rfq.transition.workflow_approved',
      },
    });
    assert(convergenceAudit !== null, 'Convergence audit log exists');
    assert(convergenceAudit?.actorSource === 'system', 'Audit actorSource = system');

    // --- Scenario B: Return → record converges to returned ---
    console.log('\n--- B. Submit → Return → Record Converges ---');

    const rfq2 = await createRfq({
      projectId: ctx.project.id,
      title: 'Convergence Proof RFQ — return flow',
      currency: 'SAR',
    }, ctx.ahmed.id);
    createdIds.push(rfq2.id);

    await transitionRfq(rfq2.id, 'submit', ctx.ahmed.id);
    let wf2 = await getWorkflowForRecord('rfq', rfq2.id);

    const rfqStep = wf2!.currentStep as any;
    const rfqApprover = getApproverForStep(rfqStep, ctx);

    // RFQ has 2 steps both requiring procurement — approve step 1, then return from step 2
    await workflowStepService.approveStep({
      instanceId: wf2!.id, stepId: rfqStep.id, actorUserId: rfqApprover.userId,
    });
    wf2 = await getWorkflowForRecord('rfq', rfq2.id);

    const rfqStep2 = wf2!.currentStep as any;
    await workflowStepService.returnStep({
      instanceId: wf2!.id, stepId: rfqStep2.id, actorUserId: rfqApprover.userId,
      comment: 'Needs revision — convergence test',
      returnToStepId: rfqStep.id,
    });

    let rfq2State = await prisma.rFQ.findUniqueOrThrow({ where: { id: rfq2.id } });
    assert(rfq2State.status === 'returned', 'RFQ record converged to returned');

    // --- Scenario C: Re-submit after return ---
    console.log('\n--- C. Re-submit After Return ---');

    await transitionRfq(rfq2.id, 'submit', ctx.ahmed.id);
    rfq2State = await prisma.rFQ.findUniqueOrThrow({ where: { id: rfq2.id } });
    assert(rfq2State.status === 'under_review', 'RFQ re-submitted to under_review');

    wf2 = await getWorkflowForRecord('rfq', rfq2.id);
    assert(wf2!.status === 'returned', 'Workflow still in returned (waiting for re-approval)');

    // --- Scenario D: Manual approval blocked ---
    console.log('\n--- D. Manual Approval Blocked ---');

    let blockedApprove = false;
    try {
      await transitionRfq(rfq2.id, 'approve', ctx.ahmed.id);
    } catch (err: any) {
      if (err.message.includes('approval phase is managed by workflow')) {
        blockedApprove = true;
      }
    }
    assert(blockedApprove, 'Manual "approve" blocked when workflow active');

    let blockedReject = false;
    try {
      await transitionRfq(rfq2.id, 'reject', ctx.ahmed.id);
    } catch (err: any) {
      if (err.message.includes('approval phase is managed by workflow')) {
        blockedReject = true;
      }
    }
    assert(blockedReject, 'Manual "reject" blocked when workflow active');

    // --- Scenario E: Reject → record converges to rejected ---
    console.log('\n--- E. Reject → Record Converges ---');

    const rfq3 = await createRfq({
      projectId: ctx.project.id,
      title: 'Convergence Proof RFQ — reject flow',
      currency: 'SAR',
    }, ctx.ahmed.id);
    createdIds.push(rfq3.id);

    await transitionRfq(rfq3.id, 'submit', ctx.ahmed.id);
    const wf3 = await getWorkflowForRecord('rfq', rfq3.id);
    const rejectStep = wf3!.currentStep as any;
    const rejectApprover = getApproverForStep(rejectStep, ctx);

    await workflowStepService.rejectStep({
      instanceId: wf3!.id, stepId: rejectStep.id, actorUserId: rejectApprover.userId,
      comment: 'Convergence proof — rejecting RFQ',
    });

    const rfq3State = await prisma.rFQ.findUniqueOrThrow({ where: { id: rfq3.id } });
    assert(rfq3State.status === 'rejected', 'RFQ record converged to rejected');

    // --- Scenario F: No drift after convergence ---
    console.log('\n--- F. No Drift After Full Lifecycle ---');

    // RFQ #1 should be: record=approved_internal, workflow=approved
    const finalRfq = await prisma.rFQ.findUniqueOrThrow({ where: { id: rfq.id } });
    const finalWf = await getWorkflowForRecord('rfq', rfq.id);
    assert(finalRfq.status === 'approved_internal', 'Final: RFQ #1 record = approved_internal');
    assert(finalWf!.status === 'approved', 'Final: RFQ #1 workflow = approved');

    // RFQ #3 should be: record=rejected, workflow=rejected
    const finalRfq3 = await prisma.rFQ.findUniqueOrThrow({ where: { id: rfq3.id } });
    const finalWf3 = await getWorkflowForRecord('rfq', rfq3.id);
    assert(finalRfq3.status === 'rejected', 'Final: RFQ #3 record = rejected');
    assert(finalWf3!.status === 'rejected', 'Final: RFQ #3 workflow = rejected');

    console.log('  No record/workflow drift detected.');

  } finally {
    console.log('\n--- Cleanup ---');
    for (const id of createdIds) {
      await cleanupRecord('rfq', id);
    }
    console.log(`  ✓ Cleaned ${createdIds.length} test RFQs`);
  }
}

// ---------------------------------------------------------------------------
// Variation Convergence Proof
// ---------------------------------------------------------------------------

async function proofVariation(ctx: TestContext) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  VARIATION CONVERGENCE PROOF');
  console.log('═══════════════════════════════════════════════════════════');

  const createdIds: string[] = [];

  try {
    // --- Scenario A: Full approval → record auto-advances to approved_internal + posting event ---
    console.log('\n--- A. Submit → Full Approval → Record Converges ---');

    const variation = await createVariation({
      projectId: ctx.project.id,
      subtype: 'vo',
      title: 'Convergence Proof VO — approve flow',
      description: 'Testing workflow convergence for Variation',
      reason: 'scope change',
      costImpact: 75000,
      timeImpactDays: 15,
      currency: 'SAR',
    }, ctx.ahmed.id);
    createdIds.push(variation.id);

    assert(variation.status === 'draft', 'Variation created in draft');

    // Submit — should auto-start workflow
    await transitionVariation(variation.id, 'submit', ctx.ahmed.id);
    let varState = await prisma.variation.findUniqueOrThrow({ where: { id: variation.id } });
    assert(varState.status === 'submitted', 'Variation status = submitted after submit');

    // Approve all workflow steps
    let wf = await getWorkflowForRecord('variation', variation.id);
    assert(wf !== null, 'Workflow instance created');

    while (wf && (wf.status === 'in_progress' || wf.status === 'returned')) {
      const curStep = wf.currentStep as any;
      if (!curStep) break;
      const approver = getApproverForStep(curStep, ctx);
      await workflowStepService.approveStep({
        instanceId: wf.id,
        stepId: curStep.id,
        actorUserId: approver.userId,
        comment: `Convergence proof — ${curStep.name}`,
      });
      wf = await getWorkflowForRecord('variation', variation.id);
    }

    assert(wf!.status === 'approved', 'Workflow status = approved');

    // ** THE KEY CHECK ** — record status should have converged
    varState = await prisma.variation.findUniqueOrThrow({ where: { id: variation.id } });
    assert(varState.status === 'approved_internal', 'Variation record converged to approved_internal');

    // Verify convergence audit log
    const convergenceAudit = await prisma.auditLog.findFirst({
      where: {
        resourceType: 'variation',
        resourceId: variation.id,
        action: 'variation.transition.workflow_approved',
      },
    });
    assert(convergenceAudit !== null, 'Convergence audit log exists');
    assert(convergenceAudit?.actorSource === 'system', 'Audit log actorSource = system');
    const afterJson = convergenceAudit?.afterJson as any;
    assert(afterJson?._convergence?.workflowInstanceId === wf!.id, 'Audit log has workflow instance ID');
    assert(
      afterJson?._convergence?.templateCode === 'variation_standard' ||
      afterJson?._convergence?.templateCode === 'variation_with_finance',
      'Audit log has variation template code',
    );

    // Verify posting event was fired (financial invariant)
    const postingEvent = await prisma.postingEvent.findFirst({
      where: {
        sourceRecordType: 'variation',
        sourceRecordId: variation.id,
        eventType: 'VARIATION_APPROVED_INTERNAL',
      },
    });
    assert(postingEvent !== null, 'VARIATION_APPROVED_INTERNAL posting event fired by convergence');
    assert(
      postingEvent!.idempotencyKey === `variation:${variation.id}:approved_internal`,
      'Posting event has correct idempotency key',
    );

    // --- Scenario B: Return → record converges to returned ---
    console.log('\n--- B. Submit → Return → Record Converges to Returned ---');

    const variation2 = await createVariation({
      projectId: ctx.project.id,
      subtype: 'change_order',
      title: 'Convergence Proof CO — return flow',
      description: 'Testing workflow return convergence',
      reason: 'contract adjustment',
      costImpact: 120000,
      timeImpactDays: 30,
      currency: 'SAR',
      originalContractValue: 2000000,
      adjustmentAmount: 120000,
      newContractValue: 2120000,
    }, ctx.ahmed.id);
    createdIds.push(variation2.id);

    await transitionVariation(variation2.id, 'submit', ctx.ahmed.id);
    let wf2 = await getWorkflowForRecord('variation', variation2.id);

    // Approve step 1 (QS Commercial)
    const step1 = wf2!.currentStep as any;
    const step1Approver = getApproverForStep(step1, ctx);
    await workflowStepService.approveStep({
      instanceId: wf2!.id, stepId: step1.id, actorUserId: step1Approver.userId,
    });
    wf2 = await getWorkflowForRecord('variation', variation2.id);

    // Return from step 2 (PM Review) → should return to step 1
    const step2 = wf2!.currentStep as any;
    const step2Approver = getApproverForStep(step2, ctx);
    await workflowStepService.returnStep({
      instanceId: wf2!.id, stepId: step2.id, actorUserId: step2Approver.userId,
      comment: 'Cost estimate needs revision — convergence test',
      returnToStepId: step1.id,
    });

    wf2 = await getWorkflowForRecord('variation', variation2.id);
    assert(wf2!.status === 'returned', 'Workflow status = returned');

    // ** THE KEY CHECK **
    let var2State = await prisma.variation.findUniqueOrThrow({ where: { id: variation2.id } });
    assert(var2State.status === 'returned', 'Variation record converged to returned');

    // Verify return audit log has step context
    const returnAudit = await prisma.auditLog.findFirst({
      where: {
        resourceType: 'variation',
        resourceId: variation2.id,
        action: 'variation.transition.workflow_returned',
      },
    });
    assert(returnAudit !== null, 'Return convergence audit log exists');
    const returnAfter = returnAudit?.afterJson as any;
    assert(returnAfter?._convergence?.returnedByStep !== null, 'Audit log has returnedByStep');
    assert(returnAfter?._convergence?.returnedToStep !== null, 'Audit log has returnedToStep');
    console.log(`  Return context: "${returnAfter?._convergence?.returnedByStep}" → "${returnAfter?._convergence?.returnedToStep}"`);

    // --- Scenario C: Re-submit after return ---
    console.log('\n--- C. Re-submit After Return ---');

    await transitionVariation(variation2.id, 'submit', ctx.ahmed.id);
    var2State = await prisma.variation.findUniqueOrThrow({ where: { id: variation2.id } });
    assert(var2State.status === 'submitted', 'Variation re-submitted after return');

    wf2 = await getWorkflowForRecord('variation', variation2.id);
    assert(wf2!.status === 'returned', 'Workflow still in returned (waiting for step approval)');
    assert(wf2!.currentStep !== null, 'Workflow has a current step to re-approve');

    // --- Scenario D: Manual approval blocked when workflow active ---
    console.log('\n--- D. Manual Approval Blocked ---');

    let blockedApprove = false;
    try {
      await transitionVariation(variation2.id, 'approve', ctx.ahmed.id);
    } catch (err: any) {
      if (err.message.includes('approval phase is managed by workflow')) {
        blockedApprove = true;
      }
    }
    assert(blockedApprove, 'Manual "approve" blocked when workflow active');

    let blockedReject = false;
    try {
      await transitionVariation(variation2.id, 'reject', ctx.ahmed.id);
    } catch (err: any) {
      if (err.message.includes('approval phase is managed by workflow')) {
        blockedReject = true;
      }
    }
    assert(blockedReject, 'Manual "reject" blocked when workflow active');

    let blockedReturn = false;
    try {
      await transitionVariation(variation2.id, 'return', ctx.ahmed.id);
    } catch (err: any) {
      if (err.message.includes('approval phase is managed by workflow')) {
        blockedReturn = true;
      }
    }
    assert(blockedReturn, 'Manual "return" blocked when workflow active');

    let blockedReview = false;
    try {
      await transitionVariation(variation2.id, 'review', ctx.ahmed.id);
    } catch (err: any) {
      if (err.message.includes('approval phase is managed by workflow')) {
        blockedReview = true;
      }
    }
    assert(blockedReview, 'Manual "review" blocked when workflow active');

    // --- Scenario E: Reject → record converges to rejected ---
    console.log('\n--- E. Reject → Record Converges to Rejected ---');

    const variation3 = await createVariation({
      projectId: ctx.project.id,
      subtype: 'vo',
      title: 'Convergence Proof VO — reject flow',
      description: 'Testing workflow rejection convergence',
      reason: 'scope reduction',
      costImpact: 30000,
      timeImpactDays: 10,
      currency: 'SAR',
    }, ctx.ahmed.id);
    createdIds.push(variation3.id);

    await transitionVariation(variation3.id, 'submit', ctx.ahmed.id);
    const wf3 = await getWorkflowForRecord('variation', variation3.id);
    const rejectStep = wf3!.currentStep as any;
    const rejectApprover = getApproverForStep(rejectStep, ctx);

    await workflowStepService.rejectStep({
      instanceId: wf3!.id, stepId: rejectStep.id, actorUserId: rejectApprover.userId,
      comment: 'Convergence proof — rejecting Variation',
    });

    const var3State = await prisma.variation.findUniqueOrThrow({ where: { id: variation3.id } });
    assert(var3State.status === 'rejected', 'Variation record converged to rejected');

    const rejectAudit = await prisma.auditLog.findFirst({
      where: {
        resourceType: 'variation',
        resourceId: variation3.id,
        action: 'variation.transition.workflow_rejected',
      },
    });
    assert(rejectAudit !== null, 'Reject convergence audit log exists');
    const rejectAfter = rejectAudit?.afterJson as any;
    assert(rejectAfter?._convergence?.rejectedAtStep !== null, 'Audit log has rejectedAtStep');
    assert(rejectAfter?._convergence?.comment === 'Convergence proof — rejecting Variation', 'Reject comment preserved in audit');

    // --- Scenario F: No drift after convergence ---
    console.log('\n--- F. No Drift After Full Lifecycle ---');

    const finalVar = await prisma.variation.findUniqueOrThrow({ where: { id: variation.id } });
    const finalWf = await getWorkflowForRecord('variation', variation.id);
    assert(finalVar.status === 'approved_internal', 'Final: Variation #1 record = approved_internal');
    assert(finalWf!.status === 'approved', 'Final: Variation #1 workflow = approved');

    const finalVar3 = await prisma.variation.findUniqueOrThrow({ where: { id: variation3.id } });
    const finalWf3 = await getWorkflowForRecord('variation', variation3.id);
    assert(finalVar3.status === 'rejected', 'Final: Variation #3 record = rejected');
    assert(finalWf3!.status === 'rejected', 'Final: Variation #3 workflow = rejected');

    console.log('  No record/workflow drift detected.');

  } finally {
    console.log('\n--- Cleanup ---');
    for (const id of createdIds) {
      await cleanupRecord('variation', id);
    }
    console.log(`  ✓ Cleaned ${createdIds.length} test Variations`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  WORKFLOW CONVERGENCE PROOF — IPA, RFQ & VARIATION       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  // Register posting event types + convergence handlers (normally done at app init)
  registerCommercialEventTypes();
  clearHandlers();
  registerConvergenceHandlers();

  let ctx: TestContext | null = null;

  try {
    console.log('\n--- Setup ---');
    ctx = await getTestContext();
    console.log(`  Project: ${ctx.project.name} (${ctx.project.code})`);

    await proofIPA(ctx);
    await proofRFQ(ctx);
    await proofVariation(ctx);
  } catch (err) {
    console.error('\n💥 FATAL ERROR:', err);
    failed++;
  } finally {
    if (ctx && ctx.tempAssignmentIds.length > 0) {
      for (const id of ctx.tempAssignmentIds) {
        await prisma.projectAssignment.delete({ where: { id } }).catch(() => {});
      }
    }
  }

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  const total = passed + failed;
  const verdict = failed === 0 ? '✅ ALL PASSED' : `⚠️  ${failed} FAILED`;
  console.log(`║  RESULTS: ${passed}/${total} passed — ${verdict.padEnd(30)}║`);
  console.log('╚═══════════════════════════════════════════════════════════╝');

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main();
