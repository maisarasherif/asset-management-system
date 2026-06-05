export const CERTIFICATE_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const CERTIFICATE_FILE_MAX_LABEL = "10 MB";

export function isCertificateFileTooLarge(file: File | null) {
  return Boolean(file && file.size > CERTIFICATE_FILE_MAX_BYTES);
}

export function certificateFileTooLargeMessage() {
  return `Certificate file must be ${CERTIFICATE_FILE_MAX_LABEL} or smaller.`;
}
