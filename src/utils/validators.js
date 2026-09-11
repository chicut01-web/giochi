// Input Validation Utilities for Piuccia Games

/**
 * Validates password complexity:
 * - At least 8 characters
 * - At least 1 lowercase letter
 * - At least 1 uppercase letter
 * - At least 1 number
 * - At least 1 special character (!@#$%^&*...)
 */
export function validatePassword(password) {
  const p = password || '';
  const minLength = p.length >= 8;
  const hasLower = /[a-z]/.test(p);
  const hasUpper = /[A-Z]/.test(p);
  const hasNumber = /[0-9]/.test(p);
  const hasSpecial = /[^a-zA-Z0-9]/.test(p);

  const isValid = minLength && hasLower && hasUpper && hasNumber && hasSpecial;

  let errorMsg = '';
  if (!minLength) {
    errorMsg = 'La password deve contenere almeno 8 caratteri.';
  } else if (!hasLower) {
    errorMsg = 'La password deve contenere almeno una lettera minuscola (a-z).';
  } else if (!hasUpper) {
    errorMsg = 'La password deve contenere almeno una lettera maiuscola (A-Z).';
  } else if (!hasNumber) {
    errorMsg = 'La password deve contenere almeno un numero (0-9).';
  } else if (!hasSpecial) {
    errorMsg = 'La password deve contenere almeno un carattere speciale (!@#$%...).';
  }

  return {
    isValid,
    minLength,
    hasLower,
    hasUpper,
    hasNumber,
    hasSpecial,
    errorMsg
  };
}

/**
 * Validates username format:
 * - 3 to 20 characters
 * - Letters, numbers, underscores, dashes, dots
 */
export function validateUsername(username) {
  const u = (username || '').trim();

  if (u.length < 3) {
    return {
      isValid: false,
      errorMsg: 'Lo username deve avere almeno 3 caratteri.'
    };
  }

  if (u.length > 20) {
    return {
      isValid: false,
      errorMsg: 'Lo username può avere al massimo 20 caratteri.'
    };
  }

  // Only letters, digits, underscores, hyphens, dots
  const validChars = /^[a-zA-Z0-9_.-]+$/;
  if (!validChars.test(u)) {
    return {
      isValid: false,
      errorMsg: 'Lo username può contenere solo lettere, numeri, trattini e underscore.'
    };
  }

  return {
    isValid: true,
    errorMsg: ''
  };
}
