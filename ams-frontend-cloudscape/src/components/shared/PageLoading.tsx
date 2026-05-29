import {
  Box,
  Container,
  SpaceBetween,
  Spinner,
} from "@cloudscape-design/components";
import type { PropsWithChildren } from "react";

export function PageLoading({ children }: PropsWithChildren) {
  return (
    <Container>
      <Box padding="l" textAlign="center">
        <SpaceBetween direction="vertical" size="s">
          <Spinner size="large" />
          <Box color="text-body-secondary">{children || "Loading data\u2026"}</Box>
        </SpaceBetween>
      </Box>
    </Container>
  );
}
