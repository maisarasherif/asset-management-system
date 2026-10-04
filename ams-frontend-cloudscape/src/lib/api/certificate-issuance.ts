import { apiRequest } from "./client";
import type { CertificatePreview } from "./certificate-preview";

export interface CertificateIssuance {
  issuance_id: string;
  certificate_id: string;
  source: "GENERATED" | "EXTERNAL";
  actor_id: string;
  document_number: string;
  state: "APPROVED" | "PROCESSING" | "FAILED" | "COMPLETED" | "ABANDONED";
  issue_date: string;
  expiry_date: string;
  snapshot: CertificatePreview["snapshot"] & { signer: { full_name: string; organization: string; owner_kind: string; signer_id: string } };
  document_sha256: string;
  document_size: number;
  failure_code: string;
  approved_at: string;
  completed_at: string | null;
}
export function approveGeneratedCertificate(certificateId: string, token: string, signal: AbortSignal) {
  return apiRequest<CertificateIssuance>(`/v1/certificate/${encodeURIComponent(certificateId)}/generated-issuance`, {
    method: "POST", body: JSON.stringify({ preview_token: token }), signal,
  });
}
export function listCertificateIssuances(certificateId: string, page = 1) {
  return apiRequest<{ data: CertificateIssuance[]; meta: { total: number } }>(`/v1/certificate/${encodeURIComponent(certificateId)}/issuances?page=${page}&limit=20`);
}
export function getIssuanceDocument(certificateId: string, issuanceId: string) {
  return apiRequest<{ url: string }>(`/v1/certificate/${encodeURIComponent(certificateId)}/issuances/${encodeURIComponent(issuanceId)}/file`);
}

export function getCertificateIssuance(certificateId: string, issuanceId: string, signal?: AbortSignal) {
 return apiRequest<CertificateIssuance>(`/v1/certificate/${encodeURIComponent(certificateId)}/issuances/${encodeURIComponent(issuanceId)}`, { signal });
}
