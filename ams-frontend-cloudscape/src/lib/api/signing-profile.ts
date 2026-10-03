import { apiRequest } from "./client";

export interface SignatureVersion {
  signature_id: string;
  sha256: string;
  width: number;
  height: number;
  byte_size: number;
  created_at: string;
}

export interface SigningProfile {
  user_id: string;
  full_name: string;
  organization: string;
  competency_category_id: string | null;
  competency_category_name: string;
  competency_category_active: boolean;
  signature: SignatureVersion | null;
  updated_at: string;
}

const path = "/v1/account/signing-profile";

export function getOwnSigningProfile() {
  return apiRequest<SigningProfile>(path);
}

export function updateOwnSigningOrganization(organization: string) {
  return apiRequest<SigningProfile>(path, { method: "PUT", body: JSON.stringify({ organization }) });
}

export function uploadOwnSignature(file: File) {
  const body = new FormData();
  body.set("file", file);
  return apiRequest<SigningProfile>(`${path}/signature`, { method: "POST", body });
}

export function getOwnSignatureImage(signatureId: string) {
  return apiRequest<Blob>(`${path}/signatures/${encodeURIComponent(signatureId)}/file`, {}, { responseMode: "blob" });
}
