import { Alert, Box, Button, ColumnLayout, FormField, SpaceBetween, Textarea } from "@cloudscape-design/components";
import { useEffect, useRef, useState } from "react";
import { prepareCertificatePreview, type CertificatePreview } from "../../lib/api/certificate-preview";

function addMonths(value: string, months: number) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(date.getUTCDate(), last));
  return first.toISOString().slice(0, 10);
}

export function GeneratedCertificatePreview({ certificateId, signerId, issueDate, expiryDate, validityMonths, requiresRenewal }: {
  certificateId: string; signerId: string; issueDate: string; expiryDate: string; validityMonths: number | null; requiresRenewal: boolean;
}) {
  const [issue, setIssue] = useState(issueDate);
  const [expiry, setExpiry] = useState(requiresRenewal ? expiryDate : "");
  const [remarks, setRemarks] = useState("");
  const [measurements, setMeasurements] = useState("");
  const [review, setReview] = useState<{ response: CertificatePreview; url: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); }, []);
  useEffect(() => {
    if (!review) return;
    const timer = window.setTimeout(() => { setExpired(true); setReview(null); }, Math.max(0, Date.parse(review.response.expires_at) - Date.now()));
    return () => { clearTimeout(timer); URL.revokeObjectURL(review.url); };
  }, [review]);
  const discard = () => {
    pending.current?.abort(); pending.current = null;
    setLoading(false); setReview(null); setExpired(false); setError("");
  };
  const invalidDates = !/^\d{4}-\d{2}-\d{2}$/.test(issue) || (requiresRenewal && (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || expiry <= issue));
  const invalidText = [...remarks].length > 4000 || [...measurements].length > 4000;
  const preview = async () => {
    discard();
    const controller = new AbortController(); pending.current = controller; setLoading(true);
    try {
      const response = await prepareCertificatePreview(certificateId, { signer_id: signerId, issue_date: issue, expiry_date: expiry, remarks, measurements }, controller.signal);
      if (controller.signal.aborted) return;
      const bytes = Uint8Array.from(atob(response.pdf_base64), (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      setReview({ response, url });
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not prepare the preview. Try again.");
    } finally {
      if (pending.current === controller) { pending.current = null; setLoading(false); }
    }
  };
  return (
    <section aria-label="Generated certificate preview">
      <SpaceBetween direction="vertical" size="m">
        <Box color="text-body-secondary">Review the examination certificate before issuance. Equipment, component, test references, and signing details are filled automatically.</Box>
        <ColumnLayout columns={2}>
          <FormField label="Generated certificate issue date">
            <input type="date" className="app-native-input" aria-label="Generated certificate issue date" value={issue} onChange={(event) => {
              discard(); setIssue(event.target.value);
              if (requiresRenewal && validityMonths) setExpiry(addMonths(event.target.value, validityMonths));
            }} />
          </FormField>
          {requiresRenewal ? <FormField label="Generated certificate expiry date" description="Filled from the test validity period; adjust if needed.">
            <input type="date" className="app-native-input" aria-label="Generated certificate expiry date" value={expiry} onChange={(event) => { discard(); setExpiry(event.target.value); }} />
          </FormField> : <Box>This test has no expiry date.</Box>}
        </ColumnLayout>
        <FormField label="Test remarks (optional)" description="Up to 4000 characters. Line breaks are preserved." errorText={[...remarks].length > 4000 ? "Use at most 4000 characters." : undefined}>
          <Textarea ariaLabel="Test remarks (optional)" value={remarks} rows={3} onChange={({ detail }) => { discard(); setRemarks(detail.value); }} />
        </FormField>
        <FormField label="Measurements (optional)" description="Up to 4000 characters." errorText={[...measurements].length > 4000 ? "Use at most 4000 characters." : undefined}>
          <Textarea ariaLabel="Measurements (optional)" value={measurements} rows={3} onChange={({ detail }) => { discard(); setMeasurements(detail.value); }} />
        </FormField>
        {error ? <Alert type="error">{error}</Alert> : null}
        {expired ? <Alert type="info">This preview expired. Your entered details are kept; create and review a fresh preview.</Alert> : null}
        <SpaceBetween direction="horizontal" size="s">
          <Button variant="primary" loading={loading} disabled={invalidDates || invalidText || loading} onClick={() => void preview()}>{review ? "Refresh PDF preview" : "Preview examination certificate"}</Button>
          {review || loading ? <Button onClick={discard}>Cancel PDF preview</Button> : null}
        </SpaceBetween>
        {review ? <section aria-label="Examination certificate PDF review">
          <SpaceBetween direction="vertical" size="m">
            <Alert type="info">Preview only. The certificate has not been renewed. The sequence is assigned when issuance is approved.</Alert>
            <Box><strong>{review.response.document_number}</strong></Box>
            <Box>Valid for {review.response.snapshot.validity_period} · Preview expires at {new Date(review.response.expires_at).toLocaleTimeString()}</Box>
            <Button href={review.url} target="_blank">Open PDF preview</Button>
            <iframe title="Examination certificate PDF preview" src={review.url} style={{ width: "100%", boxSizing: "border-box", display: "block", height: "65vh", minHeight: 320, border: "1px solid var(--color-border-divider-default, #d7e0e8)" }} />
          </SpaceBetween>
        </section> : null}
      </SpaceBetween>
    </section>
  );
}
