import type { CertificateStatus } from "../types/ams";

export interface CertificateStatusCounts {
  expired: number;
  expiringSoon: number;
  valid: number;
  pending: number;
}

export function countCertificateStatuses<T extends { status: CertificateStatus }>(
  certificates: T[]
): CertificateStatusCounts {
  return certificates.reduce(
    (counts, certificate) => {
      switch (certificate.status) {
        case "EXPIRED":
          counts.expired += 1;
          break;
        case "EXPIRING_SOON":
          counts.expiringSoon += 1;
          break;
        case "VALID":
          counts.valid += 1;
          break;
        default:
          counts.pending += 1;
          break;
      }
      return counts;
    },
    {
      expired: 0,
      expiringSoon: 0,
      valid: 0,
      pending: 0,
    }
  );
}
