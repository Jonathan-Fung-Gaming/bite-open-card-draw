export const FORM_TEXT_MAX_LENGTH = 20_000;
export const ADMIN_PASSWORD_MAX_LENGTH = 512;
export const AUDIT_REASON_MAX_LENGTH = 500;
export const STARTGG_USERNAME_MAX_LENGTH = 100;
export const DEVICE_ID_MAX_LENGTH = 128;

export function assertMaxStringLength(value: string, label: string, maxLength: number) {
  if (value.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
}
