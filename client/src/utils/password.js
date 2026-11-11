// Shared password policy: min 8 chars, upper + lower + number + symbol.
export const PASSWORD_RULES = [
  { test: (p) => p.length >= 8, label: '٨ أحرف على الأقل' },
  { test: (p) => /[A-Z]/.test(p), label: 'حرف كبير (A-Z)' },
  { test: (p) => /[a-z]/.test(p), label: 'حرف صغير (a-z)' },
  { test: (p) => /[0-9]/.test(p), label: 'رقم (0-9)' },
  { test: (p) => /[^A-Za-z0-9]/.test(p), label: 'رمز خاص (!@#$…)' },
];

export const validatePassword = (p) => PASSWORD_RULES.every((r) => r.test(p || ''));
