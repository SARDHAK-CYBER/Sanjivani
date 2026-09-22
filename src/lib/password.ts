/**
 * Password policy shared by registration and password reset (the client mirrors this for UX,
 * but this is the copy that counts).
 */
export function validatePassword(
  password: unknown,
  context: { fullName?: string | null; dob?: string | null; email?: string | null } = {}
): string | null {
  if (typeof password !== "string" || password.length < 8) return "Password must be at least 8 characters long";
  if (password.length > 128) return "Password must be at most 128 characters long";
  if (!/\d/.test(password)) return "Password must contain at least one number";
  if (!/[!@#$%^&*(),.?":{}|<>_\-+=~`'\\/[\];]/.test(password)) return "Password must contain at least one symbol";

  const lower = password.toLowerCase();
  if (context.fullName && lower === context.fullName.toLowerCase()) return "Password cannot be your name";
  if (context.dob && password === context.dob) return "Password cannot be your Date of Birth";
  if (context.email && lower === context.email.toLowerCase()) return "Password cannot be your email address";
  return null;
}
