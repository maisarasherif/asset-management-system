import {
  Alert,
  Box,
  Button,
  ColumnLayout,
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
import { useEffect, useMemo, useState } from "react";
import { PageError, PageLoading } from "../../components/shared/PageStates";
import { Select } from "../../components/shared/OptimizedSelect";
import {
  createCatalogScope,
  createCatalogScopeCategory,
  createCatalogScopeMainCategory,
  createEquipmentType,
  createTestType,
  deleteCatalogScope,
  deleteCatalogScopeCategory,
  deleteCatalogScopeMainCategory,
  deleteEquipmentType,
  deleteTestType,
  duplicateCatalogScope,
  listAllCatalogScopeCategories,
  listAllCatalogScopeMainCategories,
  listAllEquipmentTypes,
  listCatalogScopes,
  listTestTypes,
  updateCatalogScope,
  updateCatalogScopeCategory,
  updateCatalogScopeMainCategory,
  updateEquipmentType,
  updateTestType,
} from "../../lib/api/ams";
import { useFlashbar } from "../../providers/flashbar-context";
import type {
  CatalogScope,
  CatalogScopeCategory,
  CatalogScopeMainCategory,
  EquipmentType,
  TestType,
} from "../../types/ams";
import { formatMonthDuration } from "../../utils/format";

type MainCategoryEditor =
  | {
      mode: "create" | "edit";
      id?: string;
      sort_order: string;
      main_category_name: string;
      description: string;
    }
  | null;

type CategoryEditor =
  | {
      mode: "create" | "edit";
      id?: string;
      main_category_id: string;
      sort_order: string;
      category_name: string;
      description: string;
    }
  | null;

type TestTypeEditor =
  | {
      mode: "create" | "edit";
      id?: string;
      test_name: string;
      validity_duration: string;
      description: string;
    }
  | null;

type EquipmentTypeEditor =
  | {
      mode: "create" | "edit";
      id?: string;
      equipment_type_name: string;
      sort_order: string;
      description: string;
    }
  | null;

type CatalogScopeEditor =
  | {
      mode: "create" | "edit" | "duplicate";
      id?: string;
      scope_name: string;
      description: string;
    }
  | null;

type DeleteTarget =
  | {
      type: "catalog-scope" | "main-category" | "category" | "test-type" | "equipment-type";
      id: string;
      label: string;
    }
  | null;

type CatalogMutations = ReturnType<typeof useCatalogMutations>;

function TruncatedCell({ value }: { value: string }) {
  return (
    <span className="catalog-table__truncate" title={value}>
      {value}
    </span>
  );
}

function getNextMainCategorySortOrder(mainCategories: CatalogScopeMainCategory[]) {
  return mainCategories.reduce(
    (maxSortOrder, mainCategory) => Math.max(maxSortOrder, mainCategory.sort_order),
    0
  ) + 1;
}

function getNextCategorySortOrder(categories: CatalogScopeCategory[], mainCategoryId: string) {
  return categories
    .filter((category) => category.main_category_id === mainCategoryId)
    .reduce((maxSortOrder, category) => Math.max(maxSortOrder, category.sort_order), 0) + 1;
}

function getNextEquipmentTypeSortOrder(equipmentTypes: EquipmentType[]) {
  return equipmentTypes.reduce(
    (maxSortOrder, equipmentType) => Math.max(maxSortOrder, equipmentType.sort_order),
    0
  ) + 1;
}

function useCatalogData(requestedScopeId: string) {
  const catalogScopesQuery = useQuery({
    queryKey: ["catalog-scopes"],
    queryFn: listCatalogScopes,
  });

  const selectedScopeId = requestedScopeId || catalogScopesQuery.data?.[0]?.scope_id || "";

  const mainCategoriesQuery = useQuery({
    queryKey: ["catalog-scope-main-categories", selectedScopeId],
    queryFn: () => listAllCatalogScopeMainCategories(selectedScopeId),
    enabled: Boolean(selectedScopeId),
  });

  const categoriesQuery = useQuery({
    queryKey: ["catalog-scope-categories", selectedScopeId],
    queryFn: () => listAllCatalogScopeCategories(selectedScopeId),
    enabled: Boolean(selectedScopeId),
  });

  const testTypesQuery = useQuery({
    queryKey: ["test-types"],
    queryFn: listTestTypes,
  });

  const equipmentTypesQuery = useQuery({
    queryKey: ["equipment-types", "all"],
    queryFn: listAllEquipmentTypes,
  });

  const mainCategoryMap = useMemo(
    () =>
      new Map(
        (mainCategoriesQuery.data || []).map((mainCategory) => [
          mainCategory.main_category_id,
          mainCategory.main_category_name,
        ])
      ),
    [mainCategoriesQuery.data]
  );

  const mainCategorySortOrderMap = useMemo(
    () =>
      new Map(
        (mainCategoriesQuery.data || []).map((mainCategory) => [
          mainCategory.main_category_id,
          mainCategory.sort_order,
        ])
      ),
    [mainCategoriesQuery.data]
  );

  const categoryCountByMainCategory = useMemo(() => {
    const counts = new Map<string, number>();

    for (const category of categoriesQuery.data || []) {
      if (category.main_category_id) {
        counts.set(category.main_category_id, (counts.get(category.main_category_id) || 0) + 1);
      }
    }

    return counts;
  }, [categoriesQuery.data]);

  const mainCategoryOptions = useMemo<SelectProps.Option[]>(
    () =>
      (mainCategoriesQuery.data || []).map((mainCategory) => ({
        label: mainCategory.main_category_name,
        value: mainCategory.main_category_id,
        description: mainCategory.description || mainCategory.main_category_display_id,
      })),
    [mainCategoriesQuery.data]
  );

  return {
    categoriesQuery,
    categoryCountByMainCategory,
    catalogScopesQuery,
    equipmentTypesQuery,
    mainCategoriesQuery,
    mainCategoryMap,
    mainCategoryOptions,
    mainCategorySortOrderMap,
    selectedScopeId,
    testTypesQuery,
  };
}

type UseCatalogMutationsOptions = {
  onCategorySaved: () => void;
  onCatalogScopeSaved: (scope?: CatalogScope) => void;
  onDeleteComplete: () => void;
  onEquipmentTypeSaved: () => void;
  onMainCategorySaved: () => void;
  onTestTypeSaved: () => void;
  selectedScopeId: string;
  setModalError: (message: string) => void;
};

function useCatalogMutations({
  onCategorySaved,
  onCatalogScopeSaved,
  onDeleteComplete,
  onEquipmentTypeSaved,
  onMainCategorySaved,
  onTestTypeSaved,
  selectedScopeId,
  setModalError,
}: UseCatalogMutationsOptions) {
  const queryClient = useQueryClient();
  const { error, success } = useFlashbar();

  const saveMainCategoryMutation = useMutation({
    mutationFn: async (editor: NonNullable<MainCategoryEditor>) => {
      const payload = {
        sort_order: Number(editor.sort_order),
        main_category_name: editor.main_category_name.trim(),
        description: editor.description.trim(),
      };

      return editor.mode === "create"
        ? createCatalogScopeMainCategory(selectedScopeId, payload)
        : updateCatalogScopeMainCategory(editor.id!, payload);
    },
    onSuccess: async (_, editor) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["catalog-scope-main-categories"] }),
        queryClient.invalidateQueries({ queryKey: ["catalog-scope-categories"] }),
      ]);
      onMainCategorySaved();
      success(
        editor.mode === "create" ? "Main category created" : "Main category updated",
        "The catalog hierarchy has been refreshed."
      );
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
      error("Main category save failed", mutationError.message);
    },
  });

  const saveCategoryMutation = useMutation({
    mutationFn: async (editor: NonNullable<CategoryEditor>) => {
      const payload = {
        main_category_id: editor.main_category_id,
        sort_order: Number(editor.sort_order),
        category_name: editor.category_name.trim(),
        description: editor.description.trim(),
      };

      return editor.mode === "create"
        ? createCatalogScopeCategory(selectedScopeId, payload)
        : updateCatalogScopeCategory(editor.id!, payload);
    },
    onSuccess: async (_, editor) => {
      await queryClient.invalidateQueries({ queryKey: ["catalog-scope-categories"] });
      onCategorySaved();
      success(
        editor.mode === "create" ? "Category created" : "Category updated",
        "The category catalog is up to date."
      );
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
      error("Category save failed", mutationError.message);
    },
  });

  const saveTestTypeMutation = useMutation({
    mutationFn: async (editor: NonNullable<TestTypeEditor>) => {
      const payload = {
        test_name: editor.test_name.trim(),
        validity_duration: Number(editor.validity_duration),
        description: editor.description.trim(),
      };

      return editor.mode === "create" ? createTestType(payload) : updateTestType(editor.id!, payload);
    },
    onSuccess: async (_, editor) => {
      await queryClient.invalidateQueries({ queryKey: ["test-types"] });
      onTestTypeSaved();
      success(
        editor.mode === "create" ? "Test type created" : "Test type updated",
        "The test type catalog is ready for template and certificate flows."
      );
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
      error("Test type save failed", mutationError.message);
    },
  });

  const saveEquipmentTypeMutation = useMutation({
    mutationFn: async (editor: NonNullable<EquipmentTypeEditor>) => {
      const payload = {
        equipment_type_name: editor.equipment_type_name.trim(),
        sort_order: Number(editor.sort_order),
        description: editor.description.trim(),
      };

      return editor.mode === "create"
        ? createEquipmentType(payload)
        : updateEquipmentType(editor.id!, payload);
    },
    onSuccess: async (_, editor) => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-types"] });
      onEquipmentTypeSaved();
      success(
        editor.mode === "create" ? "Equipment type created" : "Equipment type updated",
        "The equipment type catalog is ready for single-asset equipment."
      );
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
      error("Equipment type save failed", mutationError.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (target: NonNullable<DeleteTarget>) => {
      if (target.type === "catalog-scope") {
        return deleteCatalogScope(target.id);
      }
      if (target.type === "main-category") {
        return deleteCatalogScopeMainCategory(target.id);
      }
      if (target.type === "category") {
        return deleteCatalogScopeCategory(target.id);
      }
      if (target.type === "equipment-type") {
        return deleteEquipmentType(target.id);
      }
      return deleteTestType(target.id);
    },
    onSuccess: async (_, target) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["catalog-scopes"] }),
        queryClient.invalidateQueries({ queryKey: ["catalog-scope-main-categories"] }),
        queryClient.invalidateQueries({ queryKey: ["catalog-scope-categories"] }),
        queryClient.invalidateQueries({ queryKey: ["test-types"] }),
        queryClient.invalidateQueries({ queryKey: ["equipment-types"] }),
      ]);
      onDeleteComplete();
      success("Catalog entry deleted", `${target.label} has been removed.`);
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
      error("Delete failed", mutationError.message);
    },
  });

  const saveCatalogScopeMutation = useMutation({
    mutationFn: async (editor: NonNullable<CatalogScopeEditor>) => {
      const payload = {
        scope_name: editor.scope_name.trim(),
        description: editor.description.trim(),
      };

      if (editor.mode === "edit") {
        await updateCatalogScope(editor.id!, payload);
        return undefined;
      }
      if (editor.mode === "duplicate") {
        return duplicateCatalogScope(editor.id!, payload);
      }
      return createCatalogScope(payload);
    },
    onSuccess: async (scope, editor) => {
      await queryClient.invalidateQueries({ queryKey: ["catalog-scopes"] });
      onCatalogScopeSaved(scope);
      success(
        editor.mode === "edit"
          ? "Catalog scope updated"
          : editor.mode === "duplicate"
            ? "Catalog scope duplicated"
            : "Catalog scope created",
        "The scoped catalog is ready."
      );
    },
    onError: (mutationError: Error) => {
      setModalError(mutationError.message);
      error("Catalog scope save failed", mutationError.message);
    },
  });

  return {
    deleteMutation,
    saveCatalogScopeMutation,
    saveCategoryMutation,
    saveEquipmentTypeMutation,
    saveMainCategoryMutation,
    saveTestTypeMutation,
  };
}

type UseCatalogColumnsOptions = {
  categoryCountByMainCategory: Map<string, number>;
  mainCategoryMap: Map<string, string>;
  mainCategorySortOrderMap: Map<string, number>;
  onDeleteCategory: (category: CatalogScopeCategory) => void;
  onDeleteEquipmentType: (equipmentType: EquipmentType) => void;
  onDeleteMainCategory: (mainCategory: CatalogScopeMainCategory) => void;
  onDeleteTestType: (testType: TestType) => void;
  onEditCategory: (category: CatalogScopeCategory) => void;
  onEditEquipmentType: (equipmentType: EquipmentType) => void;
  onEditMainCategory: (mainCategory: CatalogScopeMainCategory) => void;
  onEditTestType: (testType: TestType) => void;
};

function useCatalogColumns({
  categoryCountByMainCategory,
  mainCategoryMap,
  mainCategorySortOrderMap,
  onDeleteCategory,
  onDeleteEquipmentType,
  onDeleteMainCategory,
  onDeleteTestType,
  onEditCategory,
  onEditEquipmentType,
  onEditMainCategory,
  onEditTestType,
}: UseCatalogColumnsOptions) {
  const mainCategoryColumns = useMemo<TableProps<CatalogScopeMainCategory>["columnDefinitions"]>(
    () => [
      {
        id: "name",
        header: "Main category",
        width: "22%",
        minWidth: 180,
        cell: (item) => <TruncatedCell value={item.main_category_name} />,
      },
      { id: "order", header: "Order", width: 100, minWidth: 90, cell: (item) => item.sort_order },
      {
        id: "description",
        header: "Description",
        width: "25%",
        minWidth: 210,
        cell: (item) => <TruncatedCell value={item.description || "No description"} />,
      },
      {
        id: "categories",
        header: "Categories",
        width: 140,
        minWidth: 120,
        cell: (item) => categoryCountByMainCategory.get(item.main_category_id) || 0,
      },
      {
        id: "actions",
        header: "Actions",
        width: 220,
        minWidth: 220,
        cell: (item) => (
          <div className="catalog-table__actions">
            <Button onClick={() => onEditMainCategory(item)}>Edit</Button>
            <Button onClick={() => onDeleteMainCategory(item)}>Delete</Button>
          </div>
        ),
      },
    ],
    [categoryCountByMainCategory, onDeleteMainCategory, onEditMainCategory]
  );

  const categoryColumns = useMemo<TableProps<CatalogScopeCategory>["columnDefinitions"]>(
    () => [
      {
        id: "name",
        header: "Category",
        width: "22%",
        minWidth: 180,
        cell: (item) => <TruncatedCell value={item.category_name} />,
      },
      {
        id: "mainOrder",
        header: "Main order",
        width: 120,
        minWidth: 110,
        cell: (item) =>
          item.main_category_id ? mainCategorySortOrderMap.get(item.main_category_id) || "-" : "-",
      },
      {
        id: "order",
        header: "Category order",
        width: 140,
        minWidth: 130,
        cell: (item) => item.sort_order,
      },
      {
        id: "main",
        header: "Main category",
        width: "18%",
        minWidth: 150,
        cell: (item) => (
          <TruncatedCell
            value={(item.main_category_id && mainCategoryMap.get(item.main_category_id)) || "Unassigned"}
          />
        ),
      },
      {
        id: "description",
        header: "Description",
        width: "25%",
        minWidth: 210,
        cell: (item) => <TruncatedCell value={item.description || "No description"} />,
      },
      {
        id: "actions",
        header: "Actions",
        width: 220,
        minWidth: 220,
        cell: (item) => (
          <div className="catalog-table__actions">
            <Button onClick={() => onEditCategory(item)}>Edit</Button>
            <Button onClick={() => onDeleteCategory(item)}>Delete</Button>
          </div>
        ),
      },
    ],
    [mainCategoryMap, mainCategorySortOrderMap, onDeleteCategory, onEditCategory]
  );

  const testTypeColumns = useMemo<TableProps<TestType>["columnDefinitions"]>(
    () => [
      {
        id: "name",
        header: "Test type",
        width: "22%",
        minWidth: 180,
        cell: (item) => <TruncatedCell value={item.test_name} />,
      },
      {
        id: "duration",
        header: "Validity duration",
        width: 180,
        minWidth: 160,
        cell: (item) => formatMonthDuration(item.validity_duration),
      },
      {
        id: "description",
        header: "Description",
        width: "25%",
        minWidth: 210,
        cell: (item) => <TruncatedCell value={item.description || "No description"} />,
      },
      {
        id: "actions",
        header: "Actions",
        width: 220,
        minWidth: 220,
        cell: (item) => (
          <div className="catalog-table__actions">
            <Button onClick={() => onEditTestType(item)}>Edit</Button>
            <Button onClick={() => onDeleteTestType(item)}>Delete</Button>
          </div>
        ),
      },
    ],
    [onDeleteTestType, onEditTestType]
  );

  const equipmentTypeColumns = useMemo<TableProps<EquipmentType>["columnDefinitions"]>(
    () => [
      {
        id: "name",
        header: "Equipment type",
        width: "24%",
        minWidth: 190,
        cell: (item) => <TruncatedCell value={item.equipment_type_name} />,
      },
      { id: "order", header: "Order", width: 110, minWidth: 100, cell: (item) => item.sort_order },
      {
        id: "description",
        header: "Description",
        width: "32%",
        minWidth: 220,
        cell: (item) => <TruncatedCell value={item.description || "No description"} />,
      },
      {
        id: "actions",
        header: "Actions",
        width: 220,
        minWidth: 220,
        cell: (item) => (
          <div className="catalog-table__actions">
            <Button onClick={() => onEditEquipmentType(item)}>Edit</Button>
            <Button onClick={() => onDeleteEquipmentType(item)}>Delete</Button>
          </div>
        ),
      },
    ],
    [onDeleteEquipmentType, onEditEquipmentType]
  );

  return { categoryColumns, equipmentTypeColumns, mainCategoryColumns, testTypeColumns };
}

export function CatalogPage() {
  const [selectedScopeId, setSelectedScopeId] = useState("");
  const [catalogScopeEditor, setCatalogScopeEditor] = useState<CatalogScopeEditor>(null);
  const [mainCategoryEditor, setMainCategoryEditor] = useState<MainCategoryEditor>(null);
  const [categoryEditor, setCategoryEditor] = useState<CategoryEditor>(null);
  const [testTypeEditor, setTestTypeEditor] = useState<TestTypeEditor>(null);
  const [equipmentTypeEditor, setEquipmentTypeEditor] = useState<EquipmentTypeEditor>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [modalError, setModalError] = useState("");

  const catalogData = useCatalogData(selectedScopeId);
  const {
    categoriesQuery,
    categoryCountByMainCategory,
    catalogScopesQuery,
    equipmentTypesQuery,
    mainCategoriesQuery,
    mainCategoryMap,
    mainCategoryOptions,
    mainCategorySortOrderMap,
    selectedScopeId: activeScopeId,
    testTypesQuery,
  } = catalogData;

  const dismissMainCategoryEditor = () => {
    setModalError("");
    setMainCategoryEditor(null);
  };
  const dismissCatalogScopeEditor = () => {
    setModalError("");
    setCatalogScopeEditor(null);
  };
  const dismissCategoryEditor = () => {
    setModalError("");
    setCategoryEditor(null);
  };
  const dismissTestTypeEditor = () => {
    setModalError("");
    setTestTypeEditor(null);
  };
  const dismissEquipmentTypeEditor = () => {
    setModalError("");
    setEquipmentTypeEditor(null);
  };
  const dismissDeleteTarget = () => {
    setModalError("");
    setDeleteTarget(null);
  };

  const mutations = useCatalogMutations({
    onCategorySaved: dismissCategoryEditor,
    onCatalogScopeSaved: (scope) => {
      dismissCatalogScopeEditor();
      if (scope?.scope_id) {
        setSelectedScopeId(scope.scope_id);
      }
    },
    onDeleteComplete: () => {
      if (deleteTarget?.type === "catalog-scope") {
        setSelectedScopeId("");
      }
      dismissDeleteTarget();
    },
    onEquipmentTypeSaved: dismissEquipmentTypeEditor,
    onMainCategorySaved: dismissMainCategoryEditor,
    onTestTypeSaved: dismissTestTypeEditor,
    selectedScopeId: activeScopeId,
    setModalError,
  });

  const { categoryColumns, equipmentTypeColumns, mainCategoryColumns, testTypeColumns } =
    useCatalogColumns({
      categoryCountByMainCategory,
      mainCategoryMap,
      mainCategorySortOrderMap,
      onDeleteCategory: (category) =>
        setDeleteTarget({ type: "category", id: category.scope_category_id, label: category.category_name }),
      onDeleteEquipmentType: (equipmentType) =>
        setDeleteTarget({
          type: "equipment-type",
          id: equipmentType.equipment_type_id,
          label: equipmentType.equipment_type_name,
        }),
      onDeleteMainCategory: (mainCategory) =>
        setDeleteTarget({
          type: "main-category",
          id: mainCategory.scope_main_category_id,
          label: mainCategory.main_category_name,
        }),
      onDeleteTestType: (testType) =>
        setDeleteTarget({ type: "test-type", id: testType.test_id, label: testType.test_name }),
      onEditCategory: (category) => {
        setModalError("");
        setCategoryEditor({
          mode: "edit",
          id: category.scope_category_id,
          main_category_id: category.main_category_id,
          sort_order: String(category.sort_order),
          category_name: category.category_name,
          description: category.description || "",
        });
      },
      onEditEquipmentType: (equipmentType) => {
        setModalError("");
        setEquipmentTypeEditor({
          mode: "edit",
          id: equipmentType.equipment_type_id,
          equipment_type_name: equipmentType.equipment_type_name,
          sort_order: String(equipmentType.sort_order),
          description: equipmentType.description || "",
        });
      },
      onEditMainCategory: (mainCategory) => {
        setModalError("");
        setMainCategoryEditor({
          mode: "edit",
          id: mainCategory.scope_main_category_id,
          sort_order: String(mainCategory.sort_order),
          main_category_name: mainCategory.main_category_name,
          description: mainCategory.description || "",
        });
      },
      onEditTestType: (testType) => {
        setModalError("");
        setTestTypeEditor({
          mode: "edit",
          id: testType.test_id,
          test_name: testType.test_name,
          validity_duration: String(testType.validity_duration),
          description: testType.description || "",
        });
      },
    });

  const loading =
    catalogScopesQuery.isLoading ||
    (Boolean(catalogScopesQuery.data?.length) && !activeScopeId) ||
    mainCategoriesQuery.isLoading ||
    categoriesQuery.isLoading ||
    testTypesQuery.isLoading ||
    equipmentTypesQuery.isLoading;
  const failed =
    catalogScopesQuery.isError ||
    mainCategoriesQuery.isError ||
    categoriesQuery.isError ||
    testTypesQuery.isError ||
    equipmentTypesQuery.isError ||
    !catalogScopesQuery.data ||
    !mainCategoriesQuery.data ||
    !categoriesQuery.data ||
    !testTypesQuery.data ||
    !equipmentTypesQuery.data;

  if (loading) {
    return <PageLoading>{"Loading the admin catalog\u2026"}</PageLoading>;
  }

  if (failed) {
    return (
      <PageError
        description="The catalog workspace could not be loaded."
        onRetry={() => {
          void catalogScopesQuery.refetch();
          void mainCategoriesQuery.refetch();
          void categoriesQuery.refetch();
          void testTypesQuery.refetch();
          void equipmentTypesQuery.refetch();
        }}
      />
    );
  }

  const saveMainCategory = (editor: NonNullable<MainCategoryEditor>) => {
    if (editor.main_category_name.trim().length < 2) {
      setModalError("Main category name must be at least 2 characters.");
      return;
    }
    if (!Number.isFinite(Number(editor.sort_order)) || Number(editor.sort_order) < 1) {
      setModalError("Main category order must be a positive number.");
      return;
    }
    setModalError("");
    mutations.saveMainCategoryMutation.mutate(editor);
  };

  const saveCategory = (editor: NonNullable<CategoryEditor>) => {
    if (!editor.main_category_id) {
      setModalError("Choose a main category.");
      return;
    }
    if (editor.category_name.trim().length < 2) {
      setModalError("Category name must be at least 2 characters.");
      return;
    }
    if (!Number.isFinite(Number(editor.sort_order)) || Number(editor.sort_order) < 1) {
      setModalError("Category order must be a positive number.");
      return;
    }
    setModalError("");
    mutations.saveCategoryMutation.mutate(editor);
  };

  const saveTestType = (editor: NonNullable<TestTypeEditor>) => {
    const validityDuration = Number(editor.validity_duration);
    if (editor.test_name.trim().length < 2) {
      setModalError("Test type name must be at least 2 characters.");
      return;
    }
    if (!Number.isFinite(validityDuration) || validityDuration < 1) {
      setModalError("Validity duration must be a positive number of months.");
      return;
    }
    setModalError("");
    mutations.saveTestTypeMutation.mutate(editor);
  };

  const saveEquipmentType = (editor: NonNullable<EquipmentTypeEditor>) => {
    const sortOrder = Number(editor.sort_order);
    if (editor.equipment_type_name.trim().length < 2) {
      setModalError("Equipment type name must be at least 2 characters.");
      return;
    }
    if (!Number.isFinite(sortOrder) || sortOrder < 1) {
      setModalError("Equipment type order must be a positive number.");
      return;
    }
    setModalError("");
    mutations.saveEquipmentTypeMutation.mutate(editor);
  };

  const saveCatalogScope = (editor: NonNullable<CatalogScopeEditor>) => {
    if (editor.scope_name.trim().length < 2) {
      setModalError("Catalog scope name must be at least 2 characters.");
      return;
    }
    setModalError("");
    mutations.saveCatalogScopeMutation.mutate(editor);
  };

  const selectedScope =
    catalogScopesQuery.data.find((scope) => scope.scope_id === activeScopeId) ||
    catalogScopesQuery.data[0];

  return (
    <CatalogView
      categories={categoriesQuery.data}
      catalogScopeEditor={catalogScopeEditor}
      catalogScopes={catalogScopesQuery.data}
      categoryColumns={categoryColumns}
      categoryEditor={categoryEditor}
      deleteTarget={deleteTarget}
      equipmentTypeColumns={equipmentTypeColumns}
      equipmentTypeEditor={equipmentTypeEditor}
      equipmentTypes={equipmentTypesQuery.data}
      mainCategories={mainCategoriesQuery.data}
      mainCategoryColumns={mainCategoryColumns}
      mainCategoryEditor={mainCategoryEditor}
      mainCategoryOptions={mainCategoryOptions}
      modalError={modalError}
      mutations={mutations}
      onCreateCatalogScope={() => {
        setModalError("");
        setCatalogScopeEditor({ mode: "create", scope_name: "", description: "" });
      }}
      onCreateCategory={() => {
        setModalError("");
        setCategoryEditor({
          mode: "create",
          main_category_id: mainCategoriesQuery.data[0]?.main_category_id || "",
          sort_order: String(
            getNextCategorySortOrder(
              categoriesQuery.data,
              mainCategoriesQuery.data[0]?.main_category_id || ""
            )
          ),
          category_name: "",
          description: "",
        });
      }}
      onCreateEquipmentType={() => {
        setModalError("");
        setEquipmentTypeEditor({
          mode: "create",
          equipment_type_name: "",
          sort_order: String(getNextEquipmentTypeSortOrder(equipmentTypesQuery.data)),
          description: "",
        });
      }}
      onCreateMainCategory={() => {
        setModalError("");
        setMainCategoryEditor({
          mode: "create",
          sort_order: String(getNextMainCategorySortOrder(mainCategoriesQuery.data)),
          main_category_name: "",
          description: "",
        });
      }}
      onCreateTestType={() => {
        setModalError("");
        setTestTypeEditor({
          mode: "create",
          test_name: "",
          validity_duration: "12",
          description: "",
        });
      }}
      onDelete={() => deleteTarget && mutations.deleteMutation.mutate(deleteTarget)}
      onDeleteCatalogScope={() =>
        selectedScope &&
        setDeleteTarget({
          type: "catalog-scope",
          id: selectedScope.scope_id,
          label: selectedScope.scope_name,
        })
      }
      onDismissCategoryEditor={dismissCategoryEditor}
      onDismissCatalogScopeEditor={dismissCatalogScopeEditor}
      onDismissDeleteTarget={dismissDeleteTarget}
      onDismissEquipmentTypeEditor={dismissEquipmentTypeEditor}
      onDismissMainCategoryEditor={dismissMainCategoryEditor}
      onDismissTestTypeEditor={dismissTestTypeEditor}
      onSaveCategory={saveCategory}
      onSaveCatalogScope={saveCatalogScope}
      onSaveEquipmentType={saveEquipmentType}
      onSaveMainCategory={saveMainCategory}
      onSaveTestType={saveTestType}
      onDuplicateCatalogScope={() => {
        if (!selectedScope) {
          return;
        }
        setModalError("");
        setCatalogScopeEditor({
          mode: "duplicate",
          id: selectedScope.scope_id,
          scope_name: `${selectedScope.scope_name} copy`,
          description: selectedScope.description || "",
        });
      }}
      onRenameCatalogScope={() => {
        if (!selectedScope) {
          return;
        }
        setModalError("");
        setCatalogScopeEditor({
          mode: "edit",
          id: selectedScope.scope_id,
          scope_name: selectedScope.scope_name,
          description: selectedScope.description || "",
        });
      }}
      onSelectCatalogScope={setSelectedScopeId}
      testTypeColumns={testTypeColumns}
      testTypeEditor={testTypeEditor}
      testTypes={testTypesQuery.data}
      selectedScopeId={activeScopeId}
    />
  );
}

type CatalogViewProps = {
  categories: CatalogScopeCategory[];
  catalogScopeEditor: CatalogScopeEditor;
  catalogScopes: CatalogScope[];
  categoryColumns: TableProps<CatalogScopeCategory>["columnDefinitions"];
  categoryEditor: CategoryEditor;
  deleteTarget: DeleteTarget;
  equipmentTypeColumns: TableProps<EquipmentType>["columnDefinitions"];
  equipmentTypeEditor: EquipmentTypeEditor;
  equipmentTypes: EquipmentType[];
  mainCategories: CatalogScopeMainCategory[];
  mainCategoryColumns: TableProps<CatalogScopeMainCategory>["columnDefinitions"];
  mainCategoryEditor: MainCategoryEditor;
  mainCategoryOptions: SelectProps.Option[];
  modalError: string;
  mutations: CatalogMutations;
  onCreateCatalogScope: () => void;
  onCreateCategory: () => void;
  onCreateEquipmentType: () => void;
  onCreateMainCategory: () => void;
  onCreateTestType: () => void;
  onDelete: () => void;
  onDeleteCatalogScope: () => void;
  onDismissCategoryEditor: () => void;
  onDismissCatalogScopeEditor: () => void;
  onDismissDeleteTarget: () => void;
  onDismissEquipmentTypeEditor: () => void;
  onDismissMainCategoryEditor: () => void;
  onDismissTestTypeEditor: () => void;
  onSaveCategory: (editor: NonNullable<CategoryEditor>) => void;
  onSaveCatalogScope: (editor: NonNullable<CatalogScopeEditor>) => void;
  onSaveEquipmentType: (editor: NonNullable<EquipmentTypeEditor>) => void;
  onSaveMainCategory: (editor: NonNullable<MainCategoryEditor>) => void;
  onSaveTestType: (editor: NonNullable<TestTypeEditor>) => void;
  onDuplicateCatalogScope: () => void;
  onRenameCatalogScope: () => void;
  onSelectCatalogScope: (scopeId: string) => void;
  testTypeColumns: TableProps<TestType>["columnDefinitions"];
  testTypeEditor: TestTypeEditor;
  testTypes: TestType[];
  selectedScopeId: string;
};

function CatalogView({
  categories,
  catalogScopeEditor,
  catalogScopes,
  categoryColumns,
  categoryEditor,
  deleteTarget,
  equipmentTypeColumns,
  equipmentTypeEditor,
  equipmentTypes,
  mainCategories,
  mainCategoryColumns,
  mainCategoryEditor,
  mainCategoryOptions,
  modalError,
  mutations,
  onCreateCatalogScope,
  onCreateCategory,
  onCreateEquipmentType,
  onCreateMainCategory,
  onCreateTestType,
  onDelete,
  onDeleteCatalogScope,
  onDismissCategoryEditor,
  onDismissCatalogScopeEditor,
  onDismissDeleteTarget,
  onDismissEquipmentTypeEditor,
  onDismissMainCategoryEditor,
  onDismissTestTypeEditor,
  onSaveCategory,
  onSaveCatalogScope,
  onSaveEquipmentType,
  onSaveMainCategory,
  onSaveTestType,
  onDuplicateCatalogScope,
  onRenameCatalogScope,
  onSelectCatalogScope,
  testTypeColumns,
  testTypeEditor,
  testTypes,
  selectedScopeId,
}: CatalogViewProps) {
  const pageHeader = useMemo(
    () => (
      <Header
        description="Manage the taxonomy that powers template configuration and certificate workflows across the app."
        variant="h1"
      >
        Catalog
      </Header>
    ),
    []
  );
  const hasMainCategories = mainCategories.length > 0;

  return (
    <>
      <ContentLayout header={pageHeader}>
        <SpaceBetween direction="vertical" size="l">
          <CatalogScopeSelector
            catalogScopes={catalogScopes}
            onCreate={onCreateCatalogScope}
            onDelete={onDeleteCatalogScope}
            onDuplicate={onDuplicateCatalogScope}
            onRename={onRenameCatalogScope}
            onSelect={onSelectCatalogScope}
            selectedScopeId={selectedScopeId}
          />

          <CatalogSummary
            categories={categories}
            equipmentTypes={equipmentTypes}
            mainCategories={mainCategories}
            testTypes={testTypes}
          />

          <CatalogTableSection
            actionText="Create main category"
            columnDefinitions={mainCategoryColumns}
            description="Main categories organize the category catalog and make the template editor easier to scan."
            emptyText="No main categories are defined yet."
            items={mainCategories}
            onAction={onCreateMainCategory}
            title="Main categories"
            trackBy="scope_main_category_id"
          />

          <CategoriesTableSection
            categories={categories}
            columnDefinitions={categoryColumns}
            hasMainCategories={hasMainCategories}
            onCreateCategory={onCreateCategory}
          />

          <CatalogTableSection
            actionText="Create test type"
            columnDefinitions={testTypeColumns}
            description="Test types define certificate families and their expected validity period."
            emptyText="No test types are defined yet."
            items={testTypes}
            onAction={onCreateTestType}
            title="Test types"
            trackBy="test_id"
          />

          <CatalogTableSection
            actionText="Create equipment type"
            columnDefinitions={equipmentTypeColumns}
            description="Equipment types classify single-asset equipment without using component categories."
            emptyText="No equipment types are defined yet."
            items={equipmentTypes}
            onAction={onCreateEquipmentType}
            title="Equipment types"
            trackBy="equipment_type_id"
          />
        </SpaceBetween>
      </ContentLayout>

      <MainCategoryEditorModal
        editor={mainCategoryEditor}
        errorMessage={modalError}
        loading={mutations.saveMainCategoryMutation.isPending}
        onDismiss={onDismissMainCategoryEditor}
        onSubmit={onSaveMainCategory}
        visible={Boolean(mainCategoryEditor)}
      />

      <CatalogScopeEditorModal
        editor={catalogScopeEditor}
        errorMessage={modalError}
        loading={mutations.saveCatalogScopeMutation.isPending}
        onDismiss={onDismissCatalogScopeEditor}
        onSubmit={onSaveCatalogScope}
        visible={Boolean(catalogScopeEditor)}
      />

      <CategoryEditorModal
        categories={categories}
        editor={categoryEditor}
        errorMessage={modalError}
        loading={mutations.saveCategoryMutation.isPending}
        mainCategoryOptions={mainCategoryOptions}
        onDismiss={onDismissCategoryEditor}
        onSubmit={onSaveCategory}
        visible={Boolean(categoryEditor)}
      />

      <TestTypeEditorModal
        editor={testTypeEditor}
        errorMessage={modalError}
        loading={mutations.saveTestTypeMutation.isPending}
        onDismiss={onDismissTestTypeEditor}
        onSubmit={onSaveTestType}
        visible={Boolean(testTypeEditor)}
      />

      <EquipmentTypeEditorModal
        editor={equipmentTypeEditor}
        errorMessage={modalError}
        loading={mutations.saveEquipmentTypeMutation.isPending}
        onDismiss={onDismissEquipmentTypeEditor}
        onSubmit={onSaveEquipmentType}
        visible={Boolean(equipmentTypeEditor)}
      />

      <DeleteCatalogEntryModal
        errorMessage={modalError}
        loading={mutations.deleteMutation.isPending}
        onDelete={onDelete}
        onDismiss={onDismissDeleteTarget}
        target={deleteTarget}
      />
    </>
  );
}

type CatalogScopeSelectorProps = {
  catalogScopes: CatalogScope[];
  onCreate: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onSelect: (scopeId: string) => void;
  selectedScopeId: string;
};

function CatalogScopeSelector({
  catalogScopes,
  onCreate,
  onDelete,
  onDuplicate,
  onRename,
  onSelect,
  selectedScopeId,
}: CatalogScopeSelectorProps) {
  const options = useMemo<SelectProps.Option[]>(
    () =>
      catalogScopes.map((scope) => ({
        label: scope.scope_name,
        value: scope.scope_id,
        description: scope.description || scope.display_id,
      })),
    [catalogScopes]
  );
  const selectedOption = options.find((option) => option.value === selectedScopeId) ?? null;
  const actions = useMemo(
    () => (
      <SpaceBetween direction="horizontal" size="xs">
        <Button onClick={onRename}>Rename</Button>
        <Button onClick={onDuplicate}>Duplicate</Button>
        <Button onClick={onDelete}>Delete</Button>
        <Button variant="primary" onClick={onCreate}>
          Create scope
        </Button>
      </SpaceBetween>
    ),
    [onCreate, onDelete, onDuplicate, onRename]
  );

  return (
    <Container
      header={
        <Header
          actions={actions}
          description="Choose the catalog scope whose main categories and categories you want to manage."
          variant="h2"
        >
          Catalog scope
        </Header>
      }
    >
      <FormField label="Selected scope">
        <Select
          options={options}
          selectedOption={selectedOption}
          onChange={({ detail }) => onSelect(detail.selectedOption.value || "")}
        />
      </FormField>
    </Container>
  );
}

type CatalogSummaryProps = {
  categories: CatalogScopeCategory[];
  equipmentTypes: EquipmentType[];
  mainCategories: CatalogScopeMainCategory[];
  testTypes: TestType[];
};

function CatalogSummary({ categories, equipmentTypes, mainCategories, testTypes }: CatalogSummaryProps) {
  return (
    <ColumnLayout columns={4} variant="text-grid">
      <CatalogSummaryItem
        count={mainCategories.length}
        description="Top-level taxonomy groups for categories."
        title="Main categories"
      />
      <CatalogSummaryItem
        count={categories.length}
        description="Component classifications used by templates and asset components."
        title="Categories"
      />
      <CatalogSummaryItem
        count={testTypes.length}
        description="Default certificate test definitions and validity windows."
        title="Test types"
      />
      <CatalogSummaryItem
        count={equipmentTypes.length}
        description="Single-asset equipment classifications."
        title="Equipment types"
      />
    </ColumnLayout>
  );
}

type CatalogSummaryItemProps = {
  count: number;
  description: string;
  title: string;
};

function CatalogSummaryItem({ count, description, title }: CatalogSummaryItemProps) {
  const header = useMemo(() => <Header variant="h2">{title}</Header>, [title]);

  return (
    <Container header={header}>
      <Box fontSize="display-l" fontWeight="bold">
        {count}
      </Box>
      <Box color="text-body-secondary">{description}</Box>
    </Container>
  );
}

type CatalogTableSectionProps<T> = {
  actionDisabled?: boolean;
  actionText: string;
  columnDefinitions: TableProps<T>["columnDefinitions"];
  description: string;
  emptyText: string;
  items: T[];
  onAction: () => void;
  title: string;
  trackBy: keyof T & string;
};

function CatalogTableSection<T>({
  actionDisabled = false,
  actionText,
  columnDefinitions,
  description,
  emptyText,
  items,
  onAction,
  title,
  trackBy,
}: CatalogTableSectionProps<T>) {
  const header = useMemo(
    () => (
      <CatalogTableHeader
        actionDisabled={actionDisabled}
        actionText={actionText}
        count={items.length}
        description={description}
        onAction={onAction}
        title={title}
      />
    ),
    [actionDisabled, actionText, description, items.length, onAction, title]
  );
  const empty = useMemo(() => <Box color="text-body-secondary">{emptyText}</Box>, [emptyText]);

  return (
    <Container header={header}>
      <Table
        columnDefinitions={columnDefinitions}
        empty={empty}
        items={items}
        trackBy={trackBy}
        variant="embedded"
        wrapLines={false}
      />
    </Container>
  );
}

type CatalogTableHeaderProps = {
  actionDisabled: boolean;
  actionText: string;
  count: number;
  description: string;
  onAction: () => void;
  title: string;
};

function CatalogTableHeader({
  actionDisabled,
  actionText,
  count,
  description,
  onAction,
  title,
}: CatalogTableHeaderProps) {
  const actions = useMemo(
    () => (
      <Button disabled={actionDisabled} variant="primary" onClick={onAction}>
        {actionText}
      </Button>
    ),
    [actionDisabled, actionText, onAction]
  );

  return (
    <Header actions={actions} counter={`(${count})`} description={description} variant="h2">
      {title}
    </Header>
  );
}

type CategoriesTableSectionProps = {
  categories: CatalogScopeCategory[];
  columnDefinitions: TableProps<CatalogScopeCategory>["columnDefinitions"];
  hasMainCategories: boolean;
  onCreateCategory: () => void;
};

function CategoriesTableSection({
  categories,
  columnDefinitions,
  hasMainCategories,
  onCreateCategory,
}: CategoriesTableSectionProps) {
  return (
    <CatalogTableSection
      actionDisabled={!hasMainCategories}
      actionText={hasMainCategories ? "Create category" : "Create main category first"}
      columnDefinitions={columnDefinitions}
      description="Categories are assigned to asset components and template components."
      emptyText="No categories are defined yet."
      items={categories}
      onAction={onCreateCategory}
      title="Categories"
      trackBy="scope_category_id"
    />
  );
}

type MainCategoryEditorModalProps = {
  editor: MainCategoryEditor;
  errorMessage: string;
  loading: boolean;
  onDismiss: () => void;
  onSubmit: (editor: NonNullable<MainCategoryEditor>) => void;
  visible: boolean;
};

type CatalogScopeEditorModalProps = {
  editor: CatalogScopeEditor;
  errorMessage: string;
  loading: boolean;
  onDismiss: () => void;
  onSubmit: (editor: NonNullable<CatalogScopeEditor>) => void;
  visible: boolean;
};

function CatalogScopeEditorModal({
  editor,
  errorMessage,
  loading,
  onDismiss,
  onSubmit,
  visible,
}: CatalogScopeEditorModalProps) {
  const [draft, setDraft] = useState<CatalogScopeEditor>(editor);

  useEffect(() => {
    setDraft(editor);
  }, [editor]);

  const footer = useMemo(
    () => (
      <SpaceBetween direction="horizontal" size="xs">
        <Button onClick={onDismiss}>Cancel</Button>
        <Button loading={loading} variant="primary" onClick={() => draft && onSubmit(draft)}>
          {draft?.mode === "edit"
            ? "Save changes"
            : draft?.mode === "duplicate"
              ? "Duplicate scope"
              : "Create scope"}
        </Button>
      </SpaceBetween>
    ),
    [draft, loading, onDismiss, onSubmit]
  );

  return (
    <Modal
      visible={visible}
      header={
        draft?.mode === "edit"
          ? "Rename catalog scope"
          : draft?.mode === "duplicate"
            ? "Duplicate catalog scope"
            : "Create catalog scope"
      }
      onDismiss={onDismiss}
      footer={footer}
    >
      <SpaceBetween direction="vertical" size="l">
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        <FormField label="Catalog scope name">
          <Input
            value={draft?.scope_name || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, scope_name: detail.value })
            }
          />
        </FormField>
        <FormField label="Description">
          <Textarea
            rows={5}
            value={draft?.description || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, description: detail.value })
            }
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}

function MainCategoryEditorModal({
  editor,
  errorMessage,
  loading,
  onDismiss,
  onSubmit,
  visible,
}: MainCategoryEditorModalProps) {
  const [draft, setDraft] = useState<MainCategoryEditor>(editor);

  useEffect(() => {
    setDraft(editor);
  }, [editor]);

  const footer = useMemo(
    () => (
      <SpaceBetween direction="horizontal" size="xs">
        <Button onClick={onDismiss}>Cancel</Button>
        <Button loading={loading} variant="primary" onClick={() => draft && onSubmit(draft)}>
          {draft?.mode === "edit" ? "Save changes" : "Create main category"}
        </Button>
      </SpaceBetween>
    ),
    [draft, loading, onDismiss, onSubmit]
  );

  return (
    <Modal
      visible={visible}
      header={draft?.mode === "edit" ? "Edit main category" : "Create main category"}
      onDismiss={onDismiss}
      footer={footer}
    >
      <SpaceBetween direction="vertical" size="l">
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        <FormField label="Main category name">
          <Input
            value={draft?.main_category_name || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, main_category_name: detail.value })
            }
          />
        </FormField>
        <FormField label="Main category order">
          <Input
            inputMode="numeric"
            value={draft?.sort_order || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, sort_order: detail.value })
            }
          />
        </FormField>
        <FormField label="Description">
          <Textarea
            rows={6}
            value={draft?.description || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, description: detail.value })
            }
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}

type CategoryEditorModalProps = {
  categories: CatalogScopeCategory[];
  editor: CategoryEditor;
  errorMessage: string;
  loading: boolean;
  mainCategoryOptions: SelectProps.Option[];
  onDismiss: () => void;
  onSubmit: (editor: NonNullable<CategoryEditor>) => void;
  visible: boolean;
};

function CategoryEditorModal({
  categories,
  editor,
  errorMessage,
  loading,
  mainCategoryOptions,
  onDismiss,
  onSubmit,
  visible,
}: CategoryEditorModalProps) {
  const [draft, setDraft] = useState<CategoryEditor>(editor);

  useEffect(() => {
    setDraft(editor);
  }, [editor]);

  const selectedMainCategoryOption =
    mainCategoryOptions.find((option) => option.value === draft?.main_category_id) ?? null;
  const footer = useMemo(
    () => (
      <SpaceBetween direction="horizontal" size="xs">
        <Button onClick={onDismiss}>Cancel</Button>
        <Button loading={loading} variant="primary" onClick={() => draft && onSubmit(draft)}>
          {draft?.mode === "edit" ? "Save changes" : "Create category"}
        </Button>
      </SpaceBetween>
    ),
    [draft, loading, onDismiss, onSubmit]
  );

  return (
    <Modal
      visible={visible}
      header={draft?.mode === "edit" ? "Edit category" : "Create category"}
      onDismiss={onDismiss}
      footer={footer}
    >
      <SpaceBetween direction="vertical" size="l">
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        <FormField label="Main category">
          <div data-testid="catalog-category-main-category">
            <Select
              options={mainCategoryOptions}
              placeholder="Select main category"
              selectedOption={selectedMainCategoryOption}
              onChange={({ detail }) =>
                setDraft((current) =>
                  current
                    ? {
                        ...current,
                        main_category_id: detail.selectedOption.value || "",
                        sort_order:
                          current.mode === "create"
                            ? String(
                                getNextCategorySortOrder(
                                  categories,
                                  detail.selectedOption.value || ""
                                )
                              )
                            : current.sort_order,
                      }
                    : current
                )
              }
            />
          </div>
        </FormField>
        <FormField label="Category order">
          <Input
            inputMode="numeric"
            value={draft?.sort_order || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, sort_order: detail.value })
            }
          />
        </FormField>
        <FormField label="Category name">
          <Input
            value={draft?.category_name || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, category_name: detail.value })
            }
          />
        </FormField>
        <FormField label="Description">
          <Textarea
            rows={6}
            value={draft?.description || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, description: detail.value })
            }
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}

type TestTypeEditorModalProps = {
  editor: TestTypeEditor;
  errorMessage: string;
  loading: boolean;
  onDismiss: () => void;
  onSubmit: (editor: NonNullable<TestTypeEditor>) => void;
  visible: boolean;
};

function TestTypeEditorModal({
  editor,
  errorMessage,
  loading,
  onDismiss,
  onSubmit,
  visible,
}: TestTypeEditorModalProps) {
  const [draft, setDraft] = useState<TestTypeEditor>(editor);

  useEffect(() => {
    setDraft(editor);
  }, [editor]);

  const footer = useMemo(
    () => (
      <SpaceBetween direction="horizontal" size="xs">
        <Button onClick={onDismiss}>Cancel</Button>
        <Button loading={loading} variant="primary" onClick={() => draft && onSubmit(draft)}>
          {draft?.mode === "edit" ? "Save changes" : "Create test type"}
        </Button>
      </SpaceBetween>
    ),
    [draft, loading, onDismiss, onSubmit]
  );

  return (
    <Modal
      visible={visible}
      header={draft?.mode === "edit" ? "Edit test type" : "Create test type"}
      onDismiss={onDismiss}
      footer={footer}
    >
      <SpaceBetween direction="vertical" size="l">
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        <FormField label="Test type name">
          <Input
            value={draft?.test_name || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, test_name: detail.value })
            }
          />
        </FormField>
        <FormField label="Validity duration (months)">
          <Input
            inputMode="numeric"
            value={draft?.validity_duration || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, validity_duration: detail.value })
            }
          />
        </FormField>
        <FormField label="Description">
          <Textarea
            rows={6}
            value={draft?.description || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, description: detail.value })
            }
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}

type EquipmentTypeEditorModalProps = {
  editor: EquipmentTypeEditor;
  errorMessage: string;
  loading: boolean;
  onDismiss: () => void;
  onSubmit: (editor: NonNullable<EquipmentTypeEditor>) => void;
  visible: boolean;
};

function EquipmentTypeEditorModal({
  editor,
  errorMessage,
  loading,
  onDismiss,
  onSubmit,
  visible,
}: EquipmentTypeEditorModalProps) {
  const [draft, setDraft] = useState<EquipmentTypeEditor>(editor);

  useEffect(() => {
    setDraft(editor);
  }, [editor]);

  const footer = useMemo(
    () => (
      <SpaceBetween direction="horizontal" size="xs">
        <Button onClick={onDismiss}>Cancel</Button>
        <Button loading={loading} variant="primary" onClick={() => draft && onSubmit(draft)}>
          {draft?.mode === "edit" ? "Save changes" : "Create equipment type"}
        </Button>
      </SpaceBetween>
    ),
    [draft, loading, onDismiss, onSubmit]
  );

  return (
    <Modal
      visible={visible}
      header={draft?.mode === "edit" ? "Edit equipment type" : "Create equipment type"}
      onDismiss={onDismiss}
      footer={footer}
    >
      <SpaceBetween direction="vertical" size="l">
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        <FormField label="Equipment type name">
          <Input
            value={draft?.equipment_type_name || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, equipment_type_name: detail.value })
            }
          />
        </FormField>
        <FormField label="Equipment type order">
          <Input
            inputMode="numeric"
            value={draft?.sort_order || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, sort_order: detail.value })
            }
          />
        </FormField>
        <FormField label="Description">
          <Textarea
            rows={6}
            value={draft?.description || ""}
            onChange={({ detail }) =>
              setDraft((current) => current && { ...current, description: detail.value })
            }
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}

type DeleteCatalogEntryModalProps = {
  errorMessage: string;
  loading: boolean;
  onDelete: () => void;
  onDismiss: () => void;
  target: DeleteTarget;
};

function DeleteCatalogEntryModal({
  errorMessage,
  loading,
  onDelete,
  onDismiss,
  target,
}: DeleteCatalogEntryModalProps) {
  const footer = useMemo(
    () => (
      <SpaceBetween direction="horizontal" size="xs">
        <Button onClick={onDismiss}>Cancel</Button>
        <Button loading={loading} variant="primary" onClick={onDelete}>
          Delete
        </Button>
      </SpaceBetween>
    ),
    [loading, onDelete, onDismiss]
  );

  return (
    <Modal visible={Boolean(target)} header="Delete catalog entry" onDismiss={onDismiss} footer={footer}>
      <SpaceBetween direction="vertical" size="m">
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        <Alert type="warning">
          Delete entries only when they are no longer referenced by templates, components, or
          certificates. The backend will block unsafe deletes.
        </Alert>
        <Box>
          You are deleting{" "}
          <Box display="inline" fontWeight="bold">
            {target?.label || "this entry"}
          </Box>
          .
        </Box>
      </SpaceBetween>
    </Modal>
  );
}
