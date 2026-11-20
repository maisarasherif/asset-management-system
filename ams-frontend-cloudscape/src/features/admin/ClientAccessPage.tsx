import { ListFilters, ListPagination, type ListFacet } from "../../components/shared/ListFilters";
import { useListControls, type ListControls } from "../../components/shared/useListControls";
import { PagedSelect } from "../../components/shared/PagedSelect";
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
  SpaceBetween,
  Table,
  Textarea,
  type SelectProps,
  type TableProps,
} from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Select } from "../../components/shared/OptimizedSelect";
import { TableCellActions, TableCellText } from "../../components/shared/TableCells";
import {
  createProject,
  deleteUserProjectAccess,
  listUsers,
  searchProjects,
  searchUserProjectAccess,
  updateProject,
  updateUserProjectAccess,
  upsertUserProjectAccess,
} from "../../lib/api/ams";
import type {
  Project,
  PaginationMeta,
  ProjectAccessStatus,
  UserAccount,
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

function clientOption(user: UserAccount): SelectProps.Option {
  return {
    label: [user.first_name, user.last_name].join(" ").trim() || user.email,
    value: user.user_id,
    description: user.email,
  };
}

function projectOption(project: Project): SelectProps.Option {
  return { label: project.project_name, value: project.project_id, description: humanizeEnum(project.status) };
}

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

  useEffect(() => {
    setDraft(editor);
  }, [editor]);

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

  useEffect(() => {
    setDraft(editor);
  }, [editor]);

  const [selectedClient, setSelectedClient] = useState(
    () => clientOptions.find((option) => option.value === editor?.user_id) ?? null
  );
  const [selectedProject, setSelectedProject] = useState(
    () => projectOptions.find((option) => option.value === editor?.project_id) ?? null
  );
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
          <PagedSelect label="Client user" queryKey={["users", "client-picker"]}
            load={(page, search) => listUsers(page, 20, { search, role: "CLIENT" })}
            getOption={clientOption} selected={selectedClient} onSelect={(option) => {
              setSelectedClient(option);
              setDraft((current) => current && { ...current, user_id: option?.value ?? "" });
            }} />
        </FormField>
        <FormField label="Project">
          <PagedSelect label="Project" queryKey={["projects", "picker"]}
            load={(page, search) => searchProjects({ page, search, limit: 20 })}
            getOption={projectOption} selected={selectedProject} onSelect={(option) => {
              setSelectedProject(option);
              setDraft((current) => current && { ...current, project_id: option?.value ?? "" });
            }} />
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

  const projectControls = useListControls("projects", ["status"]);
  const accessControls = useListControls("access", ["status", "project_id", "user_id"]);
  const usersQuery = useQuery({
    queryKey: ["users", "client-default"],
    queryFn: () => listUsers(1, 1, { role: "CLIENT" }),
  });
  const defaultProjects = useQuery({
    queryKey: ["projects", "default"],
    queryFn: () => searchProjects({ page: 1, limit: 1 }),
  });
  const projectsQuery = useQuery({
    queryKey: ["projects", projectControls.query],
    queryFn: () => searchProjects(projectControls.query),
  });
  const accessQuery = useQuery({
    queryKey: ["user-project-access", accessControls.query],
    queryFn: () => searchUserProjectAccess(accessControls.query),
  });
  const clientOptions = (usersQuery.data?.data ?? []).map(clientOption);
  const projectOptions = (defaultProjects.data?.data ?? []).map(projectOption);

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
    accessItems: accessQuery.data?.data ?? [],
    accessControls,
    accessMeta: accessQuery.data?.meta,
    accessListPending: accessQuery.isPending,
    accessListFailed: accessQuery.isError,
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
    projectItems: projectsQuery.data?.data ?? [],
    projectControls,
    projectMeta: projectsQuery.data?.meta,
    projectListPending: projectsQuery.isPending,
    projectListFailed: projectsQuery.isError,
    projectLoading: saveProjectMutation.isPending,
    projectOptions,
  });
}

interface ClientAccessPageViewProps {
  accessColumns: TableProps<UserProjectAccess>["columnDefinitions"];
  accessEditor: AccessEditor;
  accessItems: UserProjectAccess[];
  accessControls: ListControls;
  accessMeta?: PaginationMeta;
  accessListPending: boolean;
  accessListFailed: boolean;
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
  projectControls: ListControls;
  projectMeta?: PaginationMeta;
  projectListPending: boolean;
  projectListFailed: boolean;
  projectLoading: boolean;
  projectOptions: SelectProps.Option[];
}

function renderClientAccessPage({
  accessColumns,
  accessEditor,
  accessItems,
  accessControls,
  accessMeta,
  accessListPending,
  accessListFailed,
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
  projectControls,
  projectMeta,
  projectListPending,
  projectListFailed,
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
                counter={`(${projectMeta?.total ?? 0})`}
                variant="h2"
              >
                Projects
              </Header>
            }
          >
            <Table
              columnDefinitions={projectColumns}
              empty={<Box color="text-body-secondary">{projectListFailed ? "This list could not be loaded." : "No projects match this view."}</Box>}
              items={projectItems}
              loading={projectListPending}
              loadingText="Loading results"
              filter={<ListFilters controls={projectControls} label="Search projects"
                facets={[statusFacet(PROJECT_STATUS_OPTIONS)]}></ListFilters>}
              pagination={<ListPagination controls={projectControls} meta={projectMeta} />}
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
                counter={`(${accessMeta?.total ?? 0})`}
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
              empty={<Box color="text-body-secondary">{accessListFailed ? "This list could not be loaded." : "No client project access matches this view."}</Box>}
              items={accessItems}
              loading={accessListPending}
              loadingText="Loading results"
              filter={<ListFilters controls={accessControls} label="Search access"
                facets={[statusFacet(ACCESS_STATUS_OPTIONS)]}>
                  <AccessFilters controls={accessControls} />
                </ListFilters>}
              pagination={<ListPagination controls={accessControls} meta={accessMeta} />}
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


function statusFacet(options: SelectProps.Option[]): ListFacet {
  return { key: "status", label: "Status", options: options.map(({ value, label }) => ({
    value: value ?? "", label: label ?? "",
  })) };
}

function AccessFilters({ controls }: { controls: ListControls }) {
  const [project, setProject] = useState<SelectProps.Option | null>(null);
  const [client, setClient] = useState<SelectProps.Option | null>(null);
  const projectId = controls.filters.project_id;
  const userId = controls.filters.user_id;
  return <>
    <FormField label="Project">
      <PagedSelect label="Project" queryKey={["projects", "picker"]} allLabel="All projects"
        load={(page, search) => searchProjects({ page, search, limit: 20 })} getOption={projectOption}
        selected={project?.value === projectId ? project : projectId ? { value: projectId, label: "Selected project" } : null}
        onSelect={(option) => { setProject(option); controls.setFilters({ project_id: option?.value ?? "" }); }} />
    </FormField>
    <FormField label="Client user">
      <PagedSelect label="Client user" queryKey={["users", "client-picker"]} allLabel="All clients"
        load={(page, search) => listUsers(page, 20, { search, role: "CLIENT" })} getOption={clientOption}
        selected={client?.value === userId ? client : userId ? { value: userId, label: "Selected client" } : null}
        onSelect={(option) => { setClient(option); controls.setFilters({ user_id: option?.value ?? "" }); }} />
    </FormField>
  </>;
}
