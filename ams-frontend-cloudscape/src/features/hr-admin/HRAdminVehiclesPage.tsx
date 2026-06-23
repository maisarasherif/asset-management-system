import {
  Alert,
  Badge,
  Box,
  Button,
  ButtonDropdown,
  Container,
  ContentLayout,
  FormField,
  Header,
  Input,
  Modal,
  SpaceBetween,
  Table,
  Textarea,
  type TableProps,
} from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { PageEmpty, PageError, PageLoading } from "../../components/shared/PageStates";
import { TableCellActions, TableCellText } from "../../components/shared/TableCells";
import {
  archiveHRAdminVehicle,
  createHRAdminVehicle,
  listHRAdminVehicles,
  updateHRAdminVehicle,
} from "../../lib/api/ams";
import { useAuth } from "../../providers/auth-context";
import { useFlashbar } from "../../providers/flashbar-context";
import type { HRAdminVehicle, HRAdminVehicleInput } from "../../types/ams";
import { formatDateTime, humanizeEnum } from "../../utils/format";

type VehicleEditor =
  | {
      mode: "create" | "edit";
      id?: string;
      plate_number: string;
      make: string;
      model: string;
      vehicle_year: string;
    }
  | null;

type ArchiveTarget =
  | {
      id: string;
      label: string;
      reason: string;
    }
  | null;

function statusBadge(status: HRAdminVehicle["status"]) {
  return <Badge color={status === "ACTIVE" ? "green" : "grey"}>{humanizeEnum(status)}</Badge>;
}

function yearValue(value: HRAdminVehicle["vehicle_year"]) {
  if (typeof value === "number") {
    return value;
  }
  if (value && typeof value === "object" && value.Valid && typeof value.Int32 === "number") {
    return value.Int32;
  }
  return null;
}

function yearLabel(value: HRAdminVehicle["vehicle_year"]) {
  return yearValue(value)?.toString() ?? "-";
}

function toVehicleInput(editor: NonNullable<VehicleEditor>): HRAdminVehicleInput {
  const parsedYear = editor.vehicle_year ? Number(editor.vehicle_year) : null;
  return {
    plate_number: editor.plate_number.trim(),
    make: editor.make.trim(),
    model: editor.model.trim(),
    vehicle_year: Number.isFinite(parsedYear) ? parsedYear : null,
  };
}

function isCompactViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches;
}

function VehicleEditorModal({
  editor,
  errorMessage,
  loading,
  onDismiss,
  onSubmit,
}: {
  editor: VehicleEditor;
  errorMessage: string;
  loading: boolean;
  onDismiss: () => void;
  onSubmit: (editor: NonNullable<VehicleEditor>) => void;
}) {
  const [draft, setDraft] = useState<VehicleEditor>(editor);

  useEffect(() => {
    setDraft(editor);
  }, [editor]);

  return (
    <Modal
      visible={Boolean(editor)}
      header={draft?.mode === "edit" ? "Edit vehicle" : "Create vehicle"}
      onDismiss={onDismiss}
      footer={
        <SpaceBetween direction="horizontal" size="xs">
          <Button onClick={onDismiss}>Cancel</Button>
          <Button loading={loading} variant="primary" onClick={() => draft && onSubmit(draft)}>
            {draft?.mode === "edit" ? "Save changes" : "Create vehicle"}
          </Button>
        </SpaceBetween>
      }
    >
      <SpaceBetween size="l">
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        <FormField label="Plate number" constraintText="Required">
          <Input
            value={draft?.plate_number || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, plate_number: detail.value })
            }
          />
        </FormField>
        <FormField label="Make">
          <Input
            value={draft?.make || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, make: detail.value })
            }
          />
        </FormField>
        <FormField label="Model">
          <Input
            value={draft?.model || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, model: detail.value })
            }
          />
        </FormField>
        <FormField label="Year" description="Optional vehicle model year.">
          <Input
            type="number"
            value={draft?.vehicle_year || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, vehicle_year: detail.value })
            }
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}

function ArchiveVehicleModal({
  errorMessage,
  loading,
  onDismiss,
  onSubmit,
  target,
}: {
  errorMessage: string;
  loading: boolean;
  onDismiss: () => void;
  onSubmit: (target: NonNullable<ArchiveTarget>) => void;
  target: ArchiveTarget;
}) {
  const [draft, setDraft] = useState<ArchiveTarget>(target);

  useEffect(() => {
    setDraft(target);
  }, [target]);

  return (
    <Modal
      visible={Boolean(target)}
      header={`Archive ${draft?.label || "vehicle"}?`}
      onDismiss={onDismiss}
      footer={
        <SpaceBetween direction="horizontal" size="xs">
          <Button onClick={onDismiss}>Keep vehicle</Button>
          <Button loading={loading} variant="primary" onClick={() => draft && onSubmit(draft)}>
            Archive vehicle
          </Button>
        </SpaceBetween>
      }
    >
      <SpaceBetween size="l">
        <Alert type="warning">
          Archived vehicles stay visible for history, but HR/Admin renewal work will ignore their records.
        </Alert>
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        <FormField label="Archive reason" constraintText="Required">
          <Textarea
            value={draft?.reason || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, reason: detail.value })
            }
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}

export function HRAdminVehiclesPage() {
  const queryClient = useQueryClient();
  const { success } = useFlashbar();
  const { getProductRole } = useAuth();
  const hrRole = getProductRole("HR_ADMIN");
  const canWrite = hrRole === "ADMIN" || hrRole === "USER";
  const canArchive = hrRole === "ADMIN";
  const [filterText, setFilterText] = useState("");
  const [compactTable, setCompactTable] = useState(() => isCompactViewport());
  const [editor, setEditor] = useState<VehicleEditor>(null);
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget>(null);
  const [modalError, setModalError] = useState("");

  const vehiclesQuery = useQuery({
    queryKey: ["hr-admin", "vehicles"],
    queryFn: () => listHRAdminVehicles(1, 100),
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 700px)");
    const syncTableMode = () => setCompactTable(mediaQuery.matches);
    syncTableMode();
    mediaQuery.addEventListener("change", syncTableMode);
    return () => mediaQuery.removeEventListener("change", syncTableMode);
  }, []);

  const invalidateVehicles = () =>
    queryClient.invalidateQueries({ queryKey: ["hr-admin", "vehicles"] });

  const saveVehicleMutation = useMutation<unknown, Error, NonNullable<VehicleEditor>>({
    mutationFn: (draft) =>
      draft.mode === "edit" && draft.id
        ? updateHRAdminVehicle(draft.id, toVehicleInput(draft))
        : createHRAdminVehicle(toVehicleInput(draft)),
    onSuccess: (_response, draft) => {
      setEditor(null);
      setModalError("");
      success(
        draft.mode === "edit" ? "Vehicle updated" : "Vehicle created",
        draft.mode === "edit" ? "The vehicle record was saved." : "The vehicle is ready for compliance records."
      );
      void invalidateVehicles();
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
    },
  });

  const archiveVehicleMutation = useMutation({
    mutationFn: (target: NonNullable<ArchiveTarget>) =>
      archiveHRAdminVehicle(target.id, target.reason.trim()),
    onSuccess: () => {
      setArchiveTarget(null);
      setModalError("");
      success("Vehicle archived", "Renewal work will ignore this vehicle while retaining history.");
      void invalidateVehicles();
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
    },
  });

  const vehicles = useMemo(() => vehiclesQuery.data?.data ?? [], [vehiclesQuery.data?.data]);
  const filteredVehicles = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) {
      return vehicles;
    }
    return vehicles.filter((vehicle) =>
      [
        vehicle.display_id,
        vehicle.plate_number,
        vehicle.make,
        vehicle.model,
        yearLabel(vehicle.vehicle_year),
        vehicle.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [filterText, vehicles]);

  const columns = useMemo<TableProps.ColumnDefinition<HRAdminVehicle>[]>(() => {
    const editVehicle = (item: HRAdminVehicle) => {
      setModalError("");
      setEditor({
        mode: "edit",
        id: item.vehicle_id,
        plate_number: item.plate_number,
        make: item.make || "",
        model: item.model || "",
        vehicle_year: yearValue(item.vehicle_year)?.toString() ?? "",
      });
    };
    const archiveVehicleRow = (item: HRAdminVehicle) => {
      setModalError("");
      setArchiveTarget({
        id: item.vehicle_id,
        label: item.plate_number,
        reason: "",
      });
    };
    const rowActions = (item: HRAdminVehicle) => {
      if (canArchive && item.status === "ACTIVE") {
        return (
          <ButtonDropdown
            ariaLabel={`Actions for ${item.plate_number}`}
            expandToViewport
            items={[
              { id: "edit", text: "Edit" },
              { id: "archive", text: "Archive" },
            ]}
            onItemClick={({ detail }) => {
              if (detail.id === "edit") {
                editVehicle(item);
                return;
              }
              archiveVehicleRow(item);
            }}
          >
            Actions
          </ButtonDropdown>
        );
      }

      if (canWrite && item.status === "ACTIVE") {
        return <Button onClick={() => editVehicle(item)}>Edit</Button>;
      }

      return <Box color="text-body-secondary">View only</Box>;
    };

    if (compactTable) {
      return [
        {
          id: "vehicle",
          header: "Vehicle",
          minWidth: 190,
          cell: (item) => (
            <TableCellText title={item.plate_number}>
              <strong>{item.plate_number}</strong>
              <br />
              {[item.make, item.model].filter(Boolean).join(" ") || item.display_id}
              {canWrite && item.status === "ACTIVE" ? (
                <div className="hr-admin-persons__compact-actions">{rowActions(item)}</div>
              ) : null}
            </TableCellText>
          ),
        },
        {
          id: "status",
          header: "Status",
          width: 92,
          minWidth: 90,
          cell: (item) => statusBadge(item.status),
        },
      ];
    }

    return [
      {
        id: "vehicle",
        header: "Vehicle",
        width: "24%",
        minWidth: 220,
        cell: (item) => (
          <TableCellText title={item.plate_number}>
            <strong>{item.plate_number}</strong>
            <br />
            {item.display_id}
          </TableCellText>
        ),
      },
      {
        id: "makeModel",
        header: "Make / model",
        width: "24%",
        minWidth: 220,
        cell: (item) => (
          <TableCellText title={[item.make, item.model].filter(Boolean).join(" ") || "-"}>
            {[item.make, item.model].filter(Boolean).join(" ") || "-"}
          </TableCellText>
        ),
      },
      {
        id: "year",
        header: "Year",
        width: 100,
        minWidth: 90,
        cell: (item) => yearLabel(item.vehicle_year),
      },
      {
        id: "status",
        header: "Status",
        width: 130,
        minWidth: 120,
        cell: (item) => statusBadge(item.status),
      },
      {
        id: "updated",
        header: "Updated",
        width: 180,
        minWidth: 170,
        cell: (item) => formatDateTime(item.updated_at),
      },
      {
        id: "actions",
        header: "Actions",
        width: 140,
        minWidth: 130,
        cell: (item) => <TableCellActions>{rowActions(item)}</TableCellActions>,
      },
    ];
  }, [canArchive, canWrite, compactTable]);

  const saveVehicle = (draft: NonNullable<VehicleEditor>) => {
    if (!draft.plate_number.trim()) {
      setModalError("Enter the vehicle plate number.");
      return;
    }
    if (draft.vehicle_year) {
      const year = Number(draft.vehicle_year);
      if (!Number.isInteger(year) || year < 1900 || year > 2200) {
        setModalError("Enter a valid vehicle year between 1900 and 2200.");
        return;
      }
    }
    setModalError("");
    saveVehicleMutation.mutate(draft);
  };

  const archiveVehicle = (target: NonNullable<ArchiveTarget>) => {
    if (target.reason.trim().length < 3) {
      setModalError("Enter an archive reason.");
      return;
    }
    setModalError("");
    archiveVehicleMutation.mutate(target);
  };

  if (vehiclesQuery.isLoading) {
    return <PageLoading>{"Loading HR/Admin vehicles..."}</PageLoading>;
  }

  if (vehiclesQuery.isError || !vehiclesQuery.data) {
    return (
      <PageError
        description="The HR/Admin vehicles list could not be loaded."
        onRetry={() => {
          void vehiclesQuery.refetch();
        }}
      />
    );
  }

  return (
    <ContentLayout
      header={
        <Header
          actions={
            canWrite ? (
              <Button
                variant="primary"
                onClick={() => {
                  setModalError("");
                  setEditor({
                    mode: "create",
                    plate_number: "",
                    make: "",
                    model: "",
                    vehicle_year: "",
                  });
                }}
              >
                Create vehicle
              </Button>
            ) : undefined
          }
          description="Vehicles tracked as company responsibility records, separate from AMS assets."
          variant="h1"
        >
          Vehicles
        </Header>
      }
    >
      <SpaceBetween size="l">
        {hrRole === "VIEWER" ? (
          <Alert type="info">Viewer access allows you to inspect and download records, but not change vehicle records.</Alert>
        ) : null}
        <Container>
          <SpaceBetween size="m">
            <Input
              ariaLabel="Search vehicles"
              placeholder="Search by plate, make, model, year, or status"
              value={filterText}
              onChange={({ detail }) => setFilterText(detail.value)}
            />
            <Table
              columnDefinitions={columns}
              empty={
                <PageEmpty
                  action={
                    canWrite ? (
                      <Button
                        onClick={() =>
                          setEditor({
                            mode: "create",
                            plate_number: "",
                            make: "",
                            model: "",
                            vehicle_year: "",
                          })
                        }
                        variant="primary"
                      >
                        Create vehicle
                      </Button>
                    ) : undefined
                  }
                  description={
                    filterText
                      ? "No vehicle records match the current search."
                      : "Create the first vehicle before adding registration, license, or other responsibility records."
                  }
                  title={filterText ? "No matching vehicles" : "No vehicles yet"}
                />
              }
              header={<Header counter={`(${filteredVehicles.length})`}>Vehicle records</Header>}
              items={filteredVehicles}
              trackBy="vehicle_id"
            />
          </SpaceBetween>
        </Container>
      </SpaceBetween>

      <VehicleEditorModal
        editor={editor}
        errorMessage={modalError}
        loading={saveVehicleMutation.isPending}
        onDismiss={() => {
          setEditor(null);
          setModalError("");
        }}
        onSubmit={saveVehicle}
      />
      <ArchiveVehicleModal
        errorMessage={modalError}
        loading={archiveVehicleMutation.isPending}
        target={archiveTarget}
        onDismiss={() => {
          setArchiveTarget(null);
          setModalError("");
        }}
        onSubmit={archiveVehicle}
      />
    </ContentLayout>
  );
}
