import {
  Alert,
  Badge,
  Box,
  Button,
  Container,
  ContentLayout,
  FormField,
  Header,
  Input,
  Modal,
  Select,
  SpaceBetween,
  Table,
  Textarea,
  type SelectProps,
  type TableProps,
} from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageError, PageLoading } from "../../components/shared/PageStates";
import { TableCellActions, TableCellText } from "../../components/shared/TableCells";
import {
  createProject,
  deleteUserProjectAccess,
  listAllUsers,
  listProjects,
  listUserProjectAccess,
  updateProject,
  updateUserProjectAccess,
  upsertUserProjectAccess,
} from "../../lib/api/ams";
import type {
  Project,
  ProjectAccessStatus,
  ProjectStatus,
  UserProjectAccess,
} from "../../types/ams";
import { useFlashbar } from "../../providers/flashbar-context";
import { formatDateTime, humanizeEnum } from "../../utils/format";

type ProjectEditor =
  | {
      mode: "create" | "edit";
      id?: string;
      project_name: string;
      description: string;
      status: ProjectStatus;
    }
  | null;

type AccessEditor =
  | {
      user_id: string;
      project_id: string;
      status: ProjectAccessStatus;
    }
  | null;

const PROJECT_STATUS_OPTIONS: SelectProps.Option[] = [
  { label: "Active", value: "ACTIVE" },
  { label: "Archived", value: "ARCHIVED" },
];

const ACCESS_STATUS_OPTIONS: SelectProps.Option[] = [
  { label: "Active", value: "ACTIVE" },
  { label: "Suspended", value: "SUSPENDED" },
];

function statusBadge(status: string) {
  return (
    <Badge color={status === "ACTIVE" ? "green" : "grey"}>{humanizeEnum(status)}</Badge>
  );
}

function ProjectEditorModal({
  editor,
  visible,
  loading,
  errorMessage,
  onDismiss,
  onSubmit,
}: {
  editor: ProjectEditor;
  visible: boolean;
  loading: boolean;
  errorMessage: string;
  onDismiss: () => void;
  onSubmit: (editor: NonNullable<ProjectEditor>) => void;
}) {
  const [draft, setDraft] = useState<NonNullable<ProjectEditor> | null>(editor);

  const selectedStatus =
    PROJECT_STATUS_OPTIONS.find((option) => option.value === draft?.status) ??
    PROJECT_STATUS_OPTIONS[0];

  return (
    <Modal
      visible={visible}
      header={draft?.mode === "edit" ? "Edit project" : "Create project"}
      onDismiss={onDismiss}
      footer={
        <SpaceBetween direction="horizontal" size="xs">
          <Button onClick={onDismiss}>Cancel</Button>
          <Button loading={loading} variant="primary" onClick={() => draft && onSubmit(draft)}>
            {draft?.mode === "edit" ? "Save changes" : "Create project"}
          </Button>
        </SpaceBetween>
      }
    >
      <SpaceBetween direction="vertical" size="l">
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        <FormField label="Project name">
          <Input
            value={draft?.project_name || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, project_name: detail.value })
            }
          />
        </FormField>
        <FormField label="Description">
          <Textarea
            rows={4}
            value={draft?.description || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, description: detail.value })
            }
          />
        </FormField>
        <FormField label="Status">
          <Select
            options={PROJECT_STATUS_OPTIONS}
            selectedOption={selectedStatus}
            onChange={({ detail }) =>
              setDraft(
                (current) =>
                  current && {
                    ...current,
                    status: (detail.selectedOption.value as ProjectStatus) || "ACTIVE",
                  }
              )
            }
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}

function AccessEditorModal({
  editor,
  visible,
  loading,
  errorMessage,
  clientOptions,
  projectOptions,
  onDismiss,
  onSubmit,
}: {
  editor: AccessEditor;
  visible: boolean;
  loading: boolean;
  errorMessage: string;
  clientOptions: SelectProps.Option[];
  projectOptions: SelectProps.Option[];
  onDismiss: () => void;
  onSubmit: (editor: NonNullable<AccessEditor>) => void;
}) {
  const [draft, setDraft] = useState<NonNullable<AccessEditor> | null>(editor);

  const selectedClient = clientOptions.find((option) => option.value === draft?.user_id) ?? null;
  const selectedProject =
    projectOptions.find((option) => option.value === draft?.project_id) ?? null;
  const selectedStatus =
    ACCESS_STATUS_OPTIONS.find((option) => option.value === draft?.status) ??
    ACCESS_STATUS_OPTIONS[0];

  return (
    <Modal
      visible={visible}
      header="Assign client project access"
      onDismiss={onDismiss}
      footer={
        <SpaceBetween direction="horizontal" size="xs">
          <Button onClick={onDismiss}>Cancel</Button>
          <Button loading={loading} variant="primary" onClick={() => draft && onSubmit(draft)}>
            Save access
          </Button>
        </SpaceBetween>
      }
    >
      <SpaceBetween direction="vertical" size="l">
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        <FormField label="Client user">
          <Select
            options={clientOptions}
            placeholder="Select client"
            selectedOption={selectedClient}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, user_id: detail.selectedOption.value || "" })
            }
          />
        </FormField>
        <FormField label="Project">
          <Select
            options={projectOptions}
            placeholder="Select project"
            selectedOption={selectedProject}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, project_id: detail.selectedOption.value || "" })
            }
          />
        </FormField>
        <FormField label="Access status">
          <Select
            options={ACCESS_STATUS_OPTIONS}
            selectedOption={selectedStatus}
            onChange={({ detail }) =>
              setDraft(
                (current) =>
                  current && {
                    ...current,
                    status: (detail.selectedOption.value as ProjectAccessStatus) || "ACTIVE",
                  }
              )
            }
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}

export function ClientAccessPage() {
  const queryClient = useQueryClient();
  const { error, success } = useFlashbar();
  const [projectEditor, setProjectEditor] = useState<ProjectEditor>(null);
  const [accessEditor, setAccessEditor] = useState<AccessEditor>(null);
  const [modalError, setModalError] = useState("");

  const usersQuery = useQuery({ queryKey: ["users", "all"], queryFn: listAllUsers });
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const accessQuery = useQuery({
    queryKey: ["user-project-access"],
    queryFn: listUserProjectAccess,
  });

  const clientUsers = useMemo(
    () => (usersQuery.data || []).filter((user) => user.role === "CLIENT"),
    [usersQuery.data]
  );
  const clientOptions = useMemo<SelectProps.Option[]>(
    () =>
      clientUsers.map((user) => ({
        label: `${user.first_name} ${user.last_name}`.trim() || user.email,
        value: user.user_id,
        description: `${user.email} - ${humanizeEnum(user.status)}`,
      })),
    [clientUsers]
  );
  const projectOptions = useMemo<SelectProps.Option[]>(
    () =>
      (projectsQuery.data || []).map((project) => ({
        label: project.project_name,
        value: project.project_id,
        description: humanizeEnum(project.status),
      })),
    [projectsQuery.data]
  );

  const saveProjectMutation = useMutation<unknown, Error, NonNullable<ProjectEditor>>({
    mutationFn: (editor: NonNullable<ProjectEditor>) => {
      const payload = {
        project_name: editor.project_name.trim(),
        description: editor.description.trim(),
        status: editor.status,
      };
      return editor.mode === "create"
        ? createProject(payload)
        : updateProject(editor.id!, payload);
    },
    onSuccess: async (_, editor) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["user-project-access"] }),
      ]);
      setProjectEditor(null);
      setModalError("");
      success(editor.mode === "create" ? "Project created" : "Project updated", "Project access data is current.");
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
      error("Project save failed", mutationError.message);
    },
  });

  const saveAccessMutation = useMutation({
    mutationFn: (editor: NonNullable<AccessEditor>) =>
      upsertUserProjectAccess(editor.user_id, {
        project_id: editor.project_id,
        status: editor.status,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user-project-access"] });
      setAccessEditor(null);
      setModalError("");
      success("Access saved", "Client project access has been updated.");
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
      error("Access save failed", mutationError.message);
    },
  });

  const updateAccessMutation = useMutation({
    mutationFn: ({
      access,
      status,
    }: {
      access: UserProjectAccess;
      status: ProjectAccessStatus;
    }) =>
      updateUserProjectAccess(access.access_id, {
        project_id: access.project_id,
        status,
      }),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["user-project-access"] });
      success(
        variables.status === "ACTIVE" ? "Access activated" : "Access suspended",
        `${variables.access.user_email} access to ${variables.access.project_name} is now ${variables.status.toLowerCase()}.`
      );
    },
    onError: (mutationError: Error) => {
      error("Access update failed", mutationError.message);
    },
  });

  const deleteAccessMutation = useMutation({
    mutationFn: deleteUserProjectAccess,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user-project-access"] });
      success("Access removed", "The project assignment has been deleted.");
    },
    onError: (mutationError: Error) => {
      error("Access removal failed", mutationError.message);
    },
  });

  const loading = usersQuery.isLoading || projectsQuery.isLoading || accessQuery.isLoading;
  const failed =
    usersQuery.isError ||
    projectsQuery.isError ||
    accessQuery.isError ||
    !usersQuery.data ||
    !projectsQuery.data ||
    !accessQuery.data;

  if (loading) {
    return <PageLoading>{"Loading client access controls\u2026"}</PageLoading>;
  }

  if (failed) {
    return (
      <PageError
        description="Client access controls could not be loaded."
        onRetry={() => {
          void usersQuery.refetch();
          void projectsQuery.refetch();
          void accessQuery.refetch();
        }}
      />
    );
  }

  const projectColumns: TableProps<Project>["columnDefinitions"] = [
    {
      id: "name",
      header: "Project",
      width: "28%",
      minWidth: 220,
      cell: (item) => (
        <TableCellText title={item.project_name}>{item.project_name}</TableCellText>
      ),
    },
    {
      id: "description",
      header: "Description",
      width: "32%",
      minWidth: 260,
      cell: (item) => (
        <TableCellText title={item.description || "-"}>{item.description || "-"}</TableCellText>
      ),
    },
    { id: "status", header: "Status", width: 130, minWidth: 120, cell: (item) => statusBadge(item.status) },
    {
      id: "updated",
      header: "Updated",
      width: 190,
      minWidth: 180,
      cell: (item) => formatDateTime(item.updated_at),
    },
    {
      id: "actions",
      header: "Actions",
      width: 100,
      minWidth: 90,
      cell: (item) => (
        <Button
          onClick={() => {
            setModalError("");
            setProjectEditor({
              mode: "edit",
              id: item.project_id,
              project_name: item.project_name,
              description: item.description,
              status: item.status,
            });
          }}
        >
          Edit
        </Button>
      ),
    },
  ];

  const accessColumns: TableProps<UserProjectAccess>["columnDefinitions"] = [
    {
      id: "client",
      header: "Client",
      width: "18%",
      minWidth: 170,
      cell: (item) => <TableCellText title={item.user_name}>{item.user_name}</TableCellText>,
    },
    {
      id: "email",
      header: "Email",
      width: "22%",
      minWidth: 220,
      cell: (item) => <TableCellText title={item.user_email}>{item.user_email}</TableCellText>,
    },
    { id: "userStatus", header: "User status", width: 130, minWidth: 120, cell: (item) => statusBadge(item.user_status) },
    {
      id: "project",
      header: "Project",
      width: "20%",
      minWidth: 190,
      cell: (item) => <TableCellText title={item.project_name}>{item.project_name}</TableCellText>,
    },
    { id: "projectStatus", header: "Project status", width: 140, minWidth: 130, cell: (item) => statusBadge(item.project_status) },
    { id: "accessStatus", header: "Access", width: 110, minWidth: 100, cell: (item) => statusBadge(item.status) },
    {
      id: "actions",
      header: "Actions",
      width: 220,
      minWidth: 220,
      cell: (item) => (
        <TableCellActions>
          <Button
            loading={updateAccessMutation.isPending}
            onClick={() =>
              updateAccessMutation.mutate({
                access: item,
                status: item.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE",
              })
            }
          >
            {item.status === "ACTIVE" ? "Suspend" : "Activate"}
          </Button>
          <Button
            loading={deleteAccessMutation.isPending}
            onClick={() => deleteAccessMutation.mutate(item.access_id)}
          >
            Remove
          </Button>
        </TableCellActions>
      ),
    },
  ];

  const saveProject = (editor: NonNullable<ProjectEditor>) => {
    if (!editor.project_name.trim()) {
      setModalError("Enter a project name.");
      return;
    }
    setModalError("");
    saveProjectMutation.mutate(editor);
  };

  const saveAccess = (editor: NonNullable<AccessEditor>) => {
    if (!editor.user_id || !editor.project_id) {
      setModalError("Choose a client user and project.");
      return;
    }
    setModalError("");
    saveAccessMutation.mutate(editor);
  };

  return renderClientAccessPage({
    accessColumns,
    accessEditor,
    accessItems: accessQuery.data,
    accessLoading: saveAccessMutation.isPending,
    clientOptions,
    modalError,
    onAccessDismiss: () => {
      setModalError("");
      setAccessEditor(null);
    },
    onCreateAccess: () => {
      setModalError("");
      setAccessEditor({
        user_id: clientOptions[0]?.value || "",
        project_id: projectOptions[0]?.value || "",
        status: "ACTIVE",
      });
    },
    onCreateProject: () => {
      setModalError("");
      setProjectEditor({
        mode: "create",
        project_name: "",
        description: "",
        status: "ACTIVE",
      });
    },
    onProjectDismiss: () => {
      setModalError("");
      setProjectEditor(null);
    },
    onSaveAccess: saveAccess,
    onSaveProject: saveProject,
    projectColumns,
    projectEditor,
    projectItems: projectsQuery.data,
    projectLoading: saveProjectMutation.isPending,
    projectOptions,
  });
}

interface ClientAccessPageViewProps {
  accessColumns: TableProps<UserProjectAccess>["columnDefinitions"];
  accessEditor: AccessEditor;
  accessItems: UserProjectAccess[];
  accessLoading: boolean;
  clientOptions: SelectProps.Option[];
  modalError: string;
  onAccessDismiss: () => void;
  onCreateAccess: () => void;
  onCreateProject: () => void;
  onProjectDismiss: () => void;
  onSaveAccess: (editor: NonNullable<AccessEditor>) => void;
  onSaveProject: (editor: NonNullable<ProjectEditor>) => void;
  projectColumns: TableProps<Project>["columnDefinitions"];
  projectEditor: ProjectEditor;
  projectItems: Project[];
  projectLoading: boolean;
  projectOptions: SelectProps.Option[];
}

function renderClientAccessPage({
  accessColumns,
  accessEditor,
  accessItems,
  accessLoading,
  clientOptions,
  modalError,
  onAccessDismiss,
  onCreateAccess,
  onCreateProject,
  onProjectDismiss,
  onSaveAccess,
  onSaveProject,
  projectColumns,
  projectEditor,
  projectItems,
  projectLoading,
  projectOptions,
}: ClientAccessPageViewProps) {
  return (
    <>
      <ContentLayout
        header={
          <Header
            description="Project records and the client assignments that control read-only certificate visibility."
            variant="h1"
          >
            Client access
          </Header>
        }
      >
        <SpaceBetween direction="vertical" size="l">
          <Container
            header={
              <Header
                actions={
                  <Button variant="primary" onClick={onCreateProject}>
                    Create project
                  </Button>
                }
                counter={`(${projectItems.length})`}
                variant="h2"
              >
                Projects
              </Header>
            }
          >
            <Table
              columnDefinitions={projectColumns}
              empty={<Box color="text-body-secondary">No projects are available.</Box>}
              items={projectItems}
              trackBy="project_id"
              variant="embedded"
            />
          </Container>

          <Container
            header={
              <Header
                actions={
                  <Button
                    variant="primary"
                    disabled={clientOptions.length === 0 || projectOptions.length === 0}
                    onClick={onCreateAccess}
                  >
                    Assign access
                  </Button>
                }
                counter={`(${accessItems.length})`}
                variant="h2"
              >
                Client project access
              </Header>
            }
          >
            {clientOptions.length === 0 ? (
              <Alert type="info">Create a user with the Client role before assigning project access.</Alert>
            ) : null}
            <Table
              columnDefinitions={accessColumns}
              empty={<Box color="text-body-secondary">No client project access is assigned.</Box>}
              items={accessItems}
              trackBy="access_id"
              variant="embedded"
            />
          </Container>
        </SpaceBetween>
      </ContentLayout>

      <ProjectEditorModal
        key={projectEditor ? `project-${projectEditor.mode}-${projectEditor.id ?? "new"}` : "project-closed"}
        editor={projectEditor}
        visible={Boolean(projectEditor)}
        loading={projectLoading}
        errorMessage={modalError}
        onDismiss={onProjectDismiss}
        onSubmit={onSaveProject}
      />

      <AccessEditorModal
        key={accessEditor ? `access-${accessEditor.user_id}-${accessEditor.project_id}` : "access-closed"}
        editor={accessEditor}
        visible={Boolean(accessEditor)}
        loading={accessLoading}
        errorMessage={modalError}
        clientOptions={clientOptions}
        projectOptions={projectOptions}
        onDismiss={onAccessDismiss}
        onSubmit={onSaveAccess}
      />
    </>
  );
}
