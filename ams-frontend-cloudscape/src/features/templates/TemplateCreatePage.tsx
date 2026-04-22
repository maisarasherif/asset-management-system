import {
  Alert,
  Button,
  Container,
  ContentLayout,
  Form,
  FormField,
  Header,
  Input,
  SpaceBetween,
  Textarea,
} from "@cloudscape-design/components";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createTemplate } from "../../lib/api/ams";
import { useFlashbar } from "../../providers/flashbar-context";

export function TemplateCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { error, success } = useFlashbar();
  const [templateName, setTemplateName] = useState("");
  const [description, setDescription] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      createTemplate({
        template_name: templateName.trim(),
        description: description.trim(),
      }),
    onSuccess: async (template) => {
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      success(
        "Template created",
        "The template is ready. Continue directly into the component and test configuration flow."
      );
      navigate(`/templates/${template.template_id}/configure`, { replace: true });
    },
    onError: (mutationError: Error) => {
      setErrorMessage(mutationError.message);
      error("Template creation failed", mutationError.message);
    },
  });

  const handleSubmit = () => {
    if (templateName.trim().length < 2) {
      setErrorMessage("Template name must be at least 2 characters.");
      return;
    }

    setErrorMessage("");
    createMutation.mutate();
  };

  return (
    <ContentLayout
      header={
        <Header
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => navigate("/templates")}>Cancel</Button>
              <Button
                loading={createMutation.isPending}
                variant="primary"
                onClick={handleSubmit}
              >
                Create template
              </Button>
            </SpaceBetween>
          }
          description="Create the template record first, then build its component and test blueprint in the configuration flow."
          variant="h1"
        >
          Create template
        </Header>
      }
    >
      <Container header={<Header variant="h2">Template details</Header>}>
        <Form>
          <SpaceBetween direction="vertical" size="l">
            {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
            <FormField label="Template name" stretch>
              <Input value={templateName} onChange={({ detail }) => setTemplateName(detail.value)} />
            </FormField>
            <FormField
              description="Describe where this template fits, such as vessel family, equipment group, or operational context."
              label="Description"
            >
              <Textarea
                rows={8}
                value={description}
                onChange={({ detail }) => setDescription(detail.value)}
              />
            </FormField>
          </SpaceBetween>
        </Form>
      </Container>
    </ContentLayout>
  );
}
