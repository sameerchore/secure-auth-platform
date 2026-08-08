/**
 * validators.js — Input validation helpers.
 *
 * Keeps validation logic out of controllers for reuse and clarity.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate an email address (basic format check).
 */
function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  return EMAIL_REGEX.test(email) && email.length <= 255;
}

/**
 * Validate password strength.
 * Requirements: ≥ 8 chars, at least one uppercase, one lowercase, one digit.
 */
function isValidPassword(password) {
  if (typeof password !== 'string') return false;
  if (password.length < 8 || password.length > 128) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
}

/**
 * Return a list of password-policy violation messages (for registration).
 */
function passwordPolicyErrors(password) {
  const errors = [];
  if (typeof password !== 'string' || password.length === 0) {
    return ['Password is required'];
  }
  if (password.length < 8)     errors.push('Password must be at least 8 characters');
  if (password.length > 128)   errors.push('Password must be at most 128 characters');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain an uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('Password must contain a lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('Password must contain a digit');
  return errors;
}

/**
 * Validate UUID format (v4 or standard 36-char hex UUID).
 */
function isValidUuid(uuid) {
  if (typeof uuid !== 'string') return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);
}

module.exports = { isValidEmail, isValidPassword, passwordPolicyErrors, isValidUuid };
