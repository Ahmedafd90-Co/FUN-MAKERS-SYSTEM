import { describe, it, expect, beforeEach, vi } from 'vitest';
import { on, emit, clearHandlers } from '../../src/workflow/events';
import type { WorkflowEventPayload } from '@fmksa/contracts';

const basePayload: WorkflowEventPayload = {
  instanceId: 'inst-1',
  templateCode: 'TPL-001',
  recordType: 'test_record',
  recordId: 'rec-1',
  projectId: 'proj-1',
  actorUserId: 'user-1',
  stepName: 'Step 1',
};

describe('workflow events', () => {
  beforeEach(() => {
    clearHandlers();
  });

  it('calls registered handler when event is emitted', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    on('workflow.started', handler);

    await emit('workflow.started', basePayload);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(basePayload);
  });

  it('calls multiple handlers for the same event', async () => {
    const handler1 = vi.fn().mockResolvedValue(undefined);
    const handler2 = vi.fn().mockResolvedValue(undefined);
    on('workflow.started', handler1);
    on('workflow.started', handler2);

    await emit('workflow.started', basePayload);

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('does not call handlers for different events', async () => {
    const startedHandler = vi.fn().mockResolvedValue(undefined);
    const approvedHandler = vi.fn().mockResolvedValue(undefined);
    on('workflow.started', startedHandler);
    on('workflow.approved', approvedHandler);

    await emit('workflow.started', basePayload);

    expect(startedHandler).toHaveBeenCalledTimes(1);
    expect(approvedHandler).not.toHaveBeenCalled();
  });

  it('continues calling handlers when one throws an error', async () => {
    const errorHandler = vi.fn().mockRejectedValue(new Error('handler error'));
    const goodHandler = vi.fn().mockResolvedValue(undefined);
    on('workflow.started', errorHandler);
    on('workflow.started', goodHandler);

    // Should not throw
    await emit('workflow.started', basePayload);

    expect(errorHandler).toHaveBeenCalledTimes(1);
    expect(goodHandler).toHaveBeenCalledTimes(1);
  });

  it('does nothing when emitting an event with no handlers', async () => {
    // Should not throw
    await emit('workflow.rejected', basePayload);
  });

  it('clearHandlers removes all handlers', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    on('workflow.started', handler);
    on('workflow.approved', handler);

    clearHandlers();

    await emit('workflow.started', basePayload);
    await emit('workflow.approved', basePayload);

    expect(handler).not.toHaveBeenCalled();
  });

  it('supports all event names', async () => {
    const events = [
      'workflow.started',
      'workflow.stepApproved',
      'workflow.approved',
      'workflow.rejected',
      'workflow.returned',
      'workflow.cancelled',
    ] as const;

    for (const event of events) {
      const handler = vi.fn().mockResolvedValue(undefined);
      on(event, handler);
      await emit(event, basePayload);
      expect(handler).toHaveBeenCalledTimes(1);
    }
  });
});
