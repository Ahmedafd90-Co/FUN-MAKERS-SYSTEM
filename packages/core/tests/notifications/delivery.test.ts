/**
 * Tests for email delivery adapter — Task 1.8.5
 *
 * Uses a mock SMTP approach via vi.mock hoisting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted so mocks are available in the vi.mock factory
const { mockSendMail, mockVerify, mockCreateTransport } = vi.hoisted(() => {
  const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-id' });
  const mockVerify = vi.fn().mockResolvedValue(true);
  const mockCreateTransport = vi.fn().mockReturnValue({
    sendMail: mockSendMail,
    verify: mockVerify,
  });
  return { mockSendMail, mockVerify, mockCreateTransport };
});

vi.mock('nodemailer', () => ({
  default: { createTransport: mockCreateTransport },
  createTransport: mockCreateTransport,
}));

import { sendEmail, verifySmtpConnection, resetTransporter } from '../../src/notifications/delivery';

describe('email delivery adapter', () => {
  beforeEach(() => {
    resetTransporter();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetTransporter();
  });

  describe('sendEmail', () => {
    it('sends email with correct options', async () => {
      await sendEmail({
        to: 'user@example.com',
        subject: 'Test Subject',
        text: 'Plain text body',
        html: '<p>HTML body</p>',
      });

      expect(mockCreateTransport).toHaveBeenCalledOnce();
      expect(mockSendMail).toHaveBeenCalledOnce();
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Test Subject',
          text: 'Plain text body',
          html: '<p>HTML body</p>',
        }),
      );
    });

    it('uses text fallback when html is omitted', async () => {
      await sendEmail({
        to: 'user@example.com',
        subject: 'Test',
        text: 'Only text',
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Only text',
          html: undefined,
        }),
      );
    });

    it('throws when SMTP rejects the message', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP connection refused'));

      await expect(
        sendEmail({
          to: 'user@example.com',
          subject: 'Test',
          text: 'body',
        }),
      ).rejects.toThrow('SMTP connection refused');
    });

    it('reuses the transporter singleton across calls', async () => {
      await sendEmail({ to: 'a@test.com', subject: 'A', text: 'a' });
      await sendEmail({ to: 'b@test.com', subject: 'B', text: 'b' });

      expect(mockCreateTransport).toHaveBeenCalledOnce();
      expect(mockSendMail).toHaveBeenCalledTimes(2);
    });
  });

  describe('verifySmtpConnection', () => {
    it('calls verify on the transporter', async () => {
      await verifySmtpConnection();
      expect(mockVerify).toHaveBeenCalledOnce();
    });

    it('throws if verification fails', async () => {
      mockVerify.mockRejectedValueOnce(new Error('Connection refused'));
      await expect(verifySmtpConnection()).rejects.toThrow('Connection refused');
    });
  });

  describe('resetTransporter', () => {
    it('forces a new transporter to be created on next call', async () => {
      await sendEmail({ to: 'a@test.com', subject: 'A', text: 'a' });
      expect(mockCreateTransport).toHaveBeenCalledOnce();

      resetTransporter();

      await sendEmail({ to: 'b@test.com', subject: 'B', text: 'b' });
      expect(mockCreateTransport).toHaveBeenCalledTimes(2);
    });
  });
});
