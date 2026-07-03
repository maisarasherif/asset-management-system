import {
  Alert,
  Box,
  Button,
  Container,
  ContentLayout,
  Form,
  FormField,
  Header,
  Input,
  SpaceBetween,
  StatusIndicator,
  Textarea,
} from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageError, PageLoading } from "../../components/shared/PageStates";
import {
  getHRAdminNotificationConfiguration,
  updateHRAdminNotificationConfiguration,
} from "../../lib/api/ams";
import { useFlashbar } from "../../providers/flashbar-context";
import type { ProductNotificationConfiguration } from "../../types/ams";

type NotificationDraft = {
  email_recipients: string;
  clickup_list_id: string;
  clickup_assignee_ids: string;
};

function normalizeList(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function formatDeliveryCount(emailRecipients: string, clickupAssignees: string) {
  const emailCount = normalizeList(emailRecipients).length;
  const assigneeCount = normalizeList(clickupAssignees).length;
  const parts = [];
  if (emailCount > 0) {
    parts.push(`${emailCount} email ${emailCount === 1 ? "recipient" : "recipients"}`);
  }
  if (assigneeCount > 0) {
    parts.push(`${assigneeCount} ClickUp ${assigneeCount === 1 ? "assignee" : "assignees"}`);
  }
  return parts.length > 0 ? parts.join(" and ") : "No notification targets configured";
}

function formatReminderDays(days: number[] | null | undefined) {
  if (!days || days.length === 0) {
    return "30, 7, 1";
  }
  return days.join(", ");
}

function validateEmails(value: string) {
  const recipients = normalizeList(value);
  const invalid = recipients.find((recipient) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient));
  if (invalid) {
    return `Check email recipient "${invalid}".`;
  }
  return "";
}

function draftFromConfig(config: ProductNotificationConfiguration): NotificationDraft {
  return {
    email_recipients: config.email_recipients || "",
    clickup_list_id: config.clickup_list_id || "",
    clickup_assignee_ids: config.clickup_assignee_ids || "",
  };
}

function payloadFromDraft(config: ProductNotificationConfiguration, draft: NotificationDraft) {
  return {
    email_recipients: draft.email_recipients.trim(),
    clickup_list_id: draft.clickup_list_id.trim(),
    clickup_assignee_ids: draft.clickup_assignee_ids.trim(),
    default_reminder_days: config.default_reminder_days?.length
      ? config.default_reminder_days
      : [30, 7, 1],
  };
}

function NotificationConfigForm({ config }: { config: ProductNotificationConfiguration }) {
  const queryClient = useQueryClient();
  const { success } = useFlashbar();
  const [draft, setDraft] = useState<NotificationDraft>(() => draftFromConfig(config));
  const [errorMessage, setErrorMessage] = useState("");

  const deliveryCount = useMemo(
    () => formatDeliveryCount(draft.email_recipients, draft.clickup_assignee_ids),
    [draft.clickup_assignee_ids, draft.email_recipients]
  );

  const saveMutation = useMutation({
    mutationFn: () => updateHRAdminNotificationConfiguration(payloadFromDraft(config, draft)),
    onSuccess: () => {
      success("Notification config saved", "HR/Admin renewal delivery targets were updated.");
      void queryClient.invalidateQueries({ queryKey: ["hr-admin", "notification-configuration"] });
    },
    onError: (error: Error) => {
      setErrorMessage(error.message);
    },
  });

  const saveNotificationConfig = () => {
    const validation = validateEmails(draft.email_recipients);
    if (validation) {
      setErrorMessage(validation);
      return;
    }
    setErrorMessage("");
    saveMutation.mutate();
  };

  const resetDraft = () => {
    setDraft(draftFromConfig(config));
    setErrorMessage("");
  };

  return (
    <ContentLayout
      header={
        <Header
          description="Delivery targets for HR/Admin renewal reminders."
          variant="h1"
        >
          Notification Config
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container
          header={
            <Header
              description="Reminder timing is managed separately in Reminder Policy."
              variant="h2"
            >
              Delivery targets
            </Header>
          }
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveNotificationConfig();
            }}
          >
            <Form
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  <Button disabled={saveMutation.isPending} onClick={resetDraft}>
                    Reset
                  </Button>
                  <Button formAction="submit" loading={saveMutation.isPending} variant="primary">
                    Save config
                  </Button>
                </SpaceBetween>
              }
            >
              <SpaceBetween size="l">
                {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
                <FormField
                  constraintText="Comma-separated email addresses."
                  description="People or shared mailboxes that receive HR/Admin renewal email reminders."
                  label="Email recipients"
                >
                  <Textarea
                    ariaLabel="Email recipients"
                    value={draft.email_recipients}
                    onChange={({ detail }) => {
                      setDraft((current) => ({ ...current, email_recipients: detail.value }));
                      setErrorMessage("");
                    }}
                  />
                </FormField>
                <FormField
                  description="ClickUp list where renewal reminder tasks should be created."
                  label="ClickUp list ID"
                >
                  <Input
                    ariaLabel="ClickUp list ID"
                    value={draft.clickup_list_id}
                    onChange={({ detail }) => {
                      setDraft((current) => ({ ...current, clickup_list_id: detail.value }));
                      setErrorMessage("");
                    }}
                  />
                </FormField>
                <FormField
                  constraintText="Comma-separated ClickUp user IDs."
                  description="Assignees attached to created HR/Admin reminder tasks."
                  label="ClickUp assignee IDs"
                >
                  <Input
                    ariaLabel="ClickUp assignee IDs"
                    value={draft.clickup_assignee_ids}
                    onChange={({ detail }) => {
                      setDraft((current) => ({ ...current, clickup_assignee_ids: detail.value }));
                      setErrorMessage("");
                    }}
                  />
                </FormField>
              </SpaceBetween>
            </Form>
          </form>
        </Container>

        <Container header={<Header variant="h2">Delivery preview</Header>}>
          <SpaceBetween size="m">
            <StatusIndicator
              type={
                draft.email_recipients.trim() || draft.clickup_list_id.trim() || draft.clickup_assignee_ids.trim()
                  ? "success"
                  : "pending"
              }
            >
              {deliveryCount}
            </StatusIndicator>
            <Box color="text-body-secondary">
              Default reminder days remain {formatReminderDays(config.default_reminder_days)}.
            </Box>
            <Box color="text-body-secondary">
              ClickUp tasks require both a list ID and at least one assignee ID.
            </Box>
          </SpaceBetween>
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}

export function HRAdminNotificationConfigPage() {
  const configQuery = useQuery({
    queryKey: ["hr-admin", "notification-configuration"],
    queryFn: getHRAdminNotificationConfiguration,
  });

  if (configQuery.isLoading) {
    return <PageLoading>{"Loading HR/Admin notification config..."}</PageLoading>;
  }

  if (configQuery.isError || !configQuery.data) {
    return (
      <PageError
        description="The HR/Admin notification config could not be loaded."
        onRetry={() => {
          void configQuery.refetch();
        }}
      />
    );
  }

  return (
    <NotificationConfigForm
      config={configQuery.data}
      key={`${configQuery.data.updated_at}-${configQuery.data.email_recipients}-${configQuery.data.clickup_list_id}-${configQuery.data.clickup_assignee_ids}`}
    />
  );
}
