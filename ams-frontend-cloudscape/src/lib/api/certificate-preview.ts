import { apiRequest } from "./client";

export interface CertificatePreviewInput {
  signer_id?: string;
  issue_date: string;
  expiry_date: string;
  remarks: string;
  measurements: string;
}
export interface CertificatePreview {
  pdf_base64: string;
  preview_token: string;
  document_number: string;
  expires_at: string;
  snapshot: {
    equipment_name: string;
    component_name: string;
    serial_number: string;
    location: string;
    test_name: string;
    test_description: string;
    imca_ref: string;
    imca_d018: string;
    issue_date: string;
    expiry_date: string;
    validity_period: string;
    remarks: string;
    measurements: string;
  };
}
export function prepareCertificatePreview(certificateId: string, input: CertificatePreviewInput, signal: AbortSignal) {
  return apiRequest<CertificatePreview>(`/v1/certificate/${encodeURIComponent(certificateId)}/generated-preview`, {
    method: "POST", body: JSON.stringify(input), signal,
  });
}
