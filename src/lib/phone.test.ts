import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhoneNumber, parseE164, maskPhone } from './phone';

test('normalizePhoneNumber handles various formats correctly', () => {
  const expected = '+919999999999';

  // 10 digits
  assert.equal(normalizePhoneNumber('9999999999'), expected);

  // 12 digits starting with +91
  assert.equal(normalizePhoneNumber('+919999999999'), expected);

  // 12 digits without +
  assert.equal(normalizePhoneNumber('919999999999'), expected);

  // Formatted with dashes
  assert.equal(normalizePhoneNumber('999-999-9999'), expected);

  // Formatted with spaces and parens
  assert.equal(normalizePhoneNumber('(999) 999 9999'), expected);
});

test('parseE164 accepts real numbers and rejects junk', () => {
  assert.equal(parseE164('9876543210'), '+919876543210');
  assert.equal(parseE164(' +1 (415) 555-0132 '), '+14155550132');
  assert.equal(parseE164('+44 20 7946 0958'), '+442079460958');

  for (const bad of ['', '   ', '12345', 'abcdefghij', '+0123456789', '+1234567890123456', null, undefined, 42]) {
    assert.equal(parseE164(bad), null, String(bad));
  }
});

test('maskPhone hides the middle digits but keeps the country code and last four', () => {
  assert.equal(maskPhone('+919876543210'), '+91******3210');
  assert.equal(maskPhone('+14155550132'), '+14*****0132');
  assert.ok(!maskPhone('+919876543210').includes('98765'));
});
