import type {
  AssetStatus,
  CertificateStatus,
} from "../types/ams";

type StatusType = "success" | "warning" | "error" | "info" | "pending";

export function assetStatusType(status: AssetStatus): StatusType {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "MAINTENANCE":
      return "warning";
    case "INACTIVE":
      return "error";
    default:
      return "info";
  }
}

export function certificateStatusType(status: CertificateStatus): StatusType {
  switch (status) {
    case "VALID":
      return "success";
    case "EXPIRING_SOON":
      return "warning";
    case "EXPIRED":
      return "error";
    case "PENDING":
      return "pending";
    default:
      return "info";
  }
}
