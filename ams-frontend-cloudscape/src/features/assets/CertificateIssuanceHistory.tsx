import { Alert, Box, Button, Container, Header, Pagination, SpaceBetween, StatusIndicator, Table } from "@cloudscape-design/components";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getIssuanceDocument, listCertificateIssuances } from "../../lib/api/certificate-issuance";
import { formatDate, formatDateTime, humanizeEnum } from "../../utils/format";

export function CertificateIssuanceHistory({ certificateId }: { certificateId: string }) {
  const [page, setPage] = useState(1);
  const [opening, setOpening] = useState("");
  const [error, setError] = useState("");
  const history = useQuery({ queryKey: ["issuances", certificateId, page], queryFn: () => listCertificateIssuances(certificateId, page) });
  const openDocument = async (id: string) => {
    // Open synchronously to avoid popup blockers after the signed URL request.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    setOpening(id); setError("");
    try {
      const response = await getIssuanceDocument(certificateId, id);
      if (tab) tab.location.href = response.url;
      else setError("Allow popups to open the issued certificate, then try again.");
    } catch (failure) {
      tab?.close(); setError(failure instanceof Error ? failure.message : "Could not open the issued document.");
    } finally { setOpening(""); }
  };
  return <section aria-label="Certificate issuance history">
    <Container header={<Header variant="h2" description="Saved examination certificates and approved issuance status." actions={<Button onClick={() => void history.refetch()}>Refresh issuance history</Button>}>Issuance history</Header>}>
      <SpaceBetween size="m">
        {error ? <Alert type="error">{error}</Alert> : null}
        {history.isError ? <Alert type="error" action={<Button onClick={() => void history.refetch()}>Retry issuance history</Button>}>{history.error.message}</Alert> : null}
        <Table items={history.data?.data ?? []} trackBy="issuance_id" loading={history.isPending} loadingText="Loading issuance history" wrapLines
          empty={<Box>No issued or approved certificates recorded.</Box>}
          pagination={<Pagination currentPageIndex={page} pagesCount={Math.max(1, Math.ceil((history.data?.meta.total ?? 0) / 20))} onChange={({ detail }) => setPage(detail.currentPageIndex)} />}
          columnDefinitions={[
            { id: "number", header: "Document number", cell: item => item.document_number || "External document" },
            { id: "state", header: "Status", cell: item => <StatusIndicator type={item.state === "COMPLETED" ? "success" : item.state === "FAILED" ? "error" : item.state === "PROCESSING" ? "in-progress" : "pending"}>{humanizeEnum(item.state)}</StatusIndicator> },
            { id: "date", header: "Issue / expiry", cell: item => `${formatDate(item.issue_date)} / ${item.expiry_date ? formatDate(item.expiry_date) : "No expiry"}` },
            { id: "signer", header: "Signer", cell: item => `${item.snapshot.signer.full_name} — ${item.snapshot.signer.organization}` },
            { id: "approved", header: "Approved", cell: item => formatDateTime(item.approved_at) },
            { id: "document", header: "Document", cell: item => item.state === "COMPLETED" ? <Button loading={opening === item.issuance_id} disabled={Boolean(opening)} onClick={() => void openDocument(item.issuance_id)}>View issued PDF</Button> : <Box>{item.failure_code === "STALE_CERTIFICATE" ? "Certificate changed after approval" : "Current certificate unchanged"}</Box> },
          ]} />
      </SpaceBetween>
    </Container>
  </section>;
}
