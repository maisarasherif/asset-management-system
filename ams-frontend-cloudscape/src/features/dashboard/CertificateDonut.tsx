import { Box, SpaceBetween, StatusIndicator } from "@cloudscape-design/components";

interface CertificateDonutProps {
  expired: number;
  expiringSoon: number;
  valid: number;
}

function buildGradient(expired: number, expiringSoon: number, valid: number) {
  const total = expired + expiringSoon + valid;
  if (total === 0) {
    return "conic-gradient(#d5dbdb 0 360deg)";
  }

  const expiredEnd = (expired / total) * 360;
  const expiringEnd = expiredEnd + (expiringSoon / total) * 360;

  return `conic-gradient(
    #ce3f31 0deg ${expiredEnd}deg,
    #b76916 ${expiredEnd}deg ${expiringEnd}deg,
    #037f5f ${expiringEnd}deg 360deg
  )`;
}

export function CertificateDonut({
  expired,
  expiringSoon,
  valid,
}: CertificateDonutProps) {
  const total = expired + expiringSoon + valid;

  return (
    <div className="certificate-donut-card">
      <div
        aria-label="Certificate status overview"
        className="certificate-donut"
        style={{ background: buildGradient(expired, expiringSoon, valid) }}
      >
        <div className="certificate-donut__inner">
          <Box variant="awsui-key-label">Certificates</Box>
          <Box fontSize="heading-xl" fontWeight="bold">
            {total}
          </Box>
        </div>
      </div>
      <SpaceBetween direction="vertical" size="xs">
        <div className="certificate-donut__legend">
          <StatusIndicator type="error">Expired</StatusIndicator>
          <Box fontWeight="bold">{expired}</Box>
        </div>
        <div className="certificate-donut__legend">
          <StatusIndicator type="warning">Expiring soon</StatusIndicator>
          <Box fontWeight="bold">{expiringSoon}</Box>
        </div>
        <div className="certificate-donut__legend">
          <StatusIndicator type="success">Valid</StatusIndicator>
          <Box fontWeight="bold">{valid}</Box>
        </div>
      </SpaceBetween>
    </div>
  );
}
