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
  Select,
  SpaceBetween,
  Table,
  Textarea,
  type SelectProps,
  type TableProps,
} from "@cloudscape-design/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { PageError, PageLoading } from "../../components/shared/PageStates";
import {
  createCategory,
  createEquipmentType,
  createMainCategory,
  createTestType,
  deleteCategory,
  deleteEquipmentType,
  deleteMainCategory,
  deleteTestType,
  listAllCategories,
  listAllEquipmentTypes,
  listAllMainCategories,
  listTestTypes,
  updateCategory,
  updateEquipmentType,
  updateMainCategory,
  updateTestType,
} from "../../lib/api/ams";
import { useFlashbar } from "../../providers/flashbar-context";
import type { Category, EquipmentType, MainCategory, TestType } from "../../types/ams";
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

type DeleteTarget =
  | {
      type: "main-category" | "category" | "test-type" | "equipment-type";
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

function getNextMainCategorySortOrder(mainCategories: MainCategory[]) {
  return mainCategories.reduce(
    (maxSortOrder, mainCategory) => Math.max(maxSortOrder, mainCategory.sort_order),
    0
  ) + 1;
}

function getNextCategorySortOrder(categories: Category[], mainCategoryId: string) {
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

function useCatalogData() {
  const mainCategoriesQuery = useQuery({
    queryKey: ["main-categories", "all"],
    queryFn: listAllMainCategories,
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories", "all"],
    queryFn: listAllCategories,
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
        description: mainCategory.description || mainCategory.display_id,
      })),
    [mainCategoriesQuery.data]
  );

  return {
    categoriesQuery,
    categoryCountByMainCategory,
    equipmentTypesQuery,
    mainCategoriesQuery,
    mainCategoryMap,
    mainCategoryOptions,
    mainCategorySortOrderMap,
    testTypesQuery,
  };
}

type UseCatalogMutationsOptions = {
  onCategorySaved: () => void;
  onDeleteComplete: () => void;
  onEquipmentTypeSaved: () => void;
  onMainCategorySaved: () => void;
  onTestTypeSaved: () => void;
  setModalError: (message: string) => void;
};

function useCatalogMutations({
  onCategorySaved,
  onDeleteComplete,
  onEquipmentTypeSaved,
  onMainCategorySaved,
  onTestTypeSaved,
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
        ? createMainCategory(payload)
        : updateMainCategory(editor.id!, payload);
    },
    onSuccess: async (_, editor) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["main-categories"] }),
        queryClient.invalidateQueries({ queryKey: ["categories"] }),
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

      return editor.mode === "create" ? createCategory(payload) : updateCategory(editor.id!, payload);
    },
    onSuccess: async (_, editor) => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
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
      if (target.type === "main-category") {
        return deleteMainCategory(target.id);
      }
      if (target.type === "category") {
        return deleteCategory(target.id);
      }
      if (target.type === "equipment-type") {
        return deleteEquipmentType(target.id);
      }
      return deleteTestType(target.id);
    },
    onSuccess: async (_, target) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["main-categories"] }),
        queryClient.invalidateQueries({ queryKey: ["categories"] }),
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

  return {
    deleteMutation,
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
  onDeleteCategory: (category: Category) => void;
  onDeleteEquipmentType: (equipmentType: EquipmentType) => void;
  onDeleteMainCategory: (mainCategory: MainCategory) => void;
  onDeleteTestType: (testType: TestType) => void;
  onEditCategory: (category: Category) => void;
  onEditEquipmentType: (equipmentType: EquipmentType) => void;
  onEditMainCategory: (mainCategory: MainCategory) => void;
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
  const mainCategoryColumns = useMemo<TableProps<MainCategory>["columnDefinitions"]>(
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

  const categoryColumns = useMemo<TableProps<Category>["columnDefinitions"]>(
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
  const [mainCategoryEditor, setMainCategoryEditor] = useState<MainCategoryEditor>(null);
  const [categoryEditor, setCategoryEditor] = useState<CategoryEditor>(null);
  const [testTypeEditor, setTestTypeEditor] = useState<TestTypeEditor>(null);
  const [equipmentTypeEditor, setEquipmentTypeEditor] = useState<EquipmentTypeEditor>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [modalError, setModalError] = useState("");

  const catalogData = useCatalogData();
  const {
    categoriesQuery,
    categoryCountByMainCategory,
    equipmentTypesQuery,
    mainCategoriesQuery,
    mainCategoryMap,
    mainCategoryOptions,
    mainCategorySortOrderMap,
    testTypesQuery,
  } = catalogData;

  const dismissMainCategoryEditor = () => {
    setModalError("");
    setMainCategoryEditor(null);
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
    onDeleteComplete: dismissDeleteTarget,
    onEquipmentTypeSaved: dismissEquipmentTypeEditor,
    onMainCategorySaved: dismissMainCategoryEditor,
    onTestTypeSaved: dismissTestTypeEditor,
    setModalError,
  });

  const { categoryColumns, equipmentTypeColumns, mainCategoryColumns, testTypeColumns } =
    useCatalogColumns({
      categoryCountByMainCategory,
      mainCategoryMap,
      mainCategorySortOrderMap,
      onDeleteCategory: (category) =>
        setDeleteTarget({ type: "category", id: category.category_id, label: category.category_name }),
      onDeleteEquipmentType: (equipmentType) =>
        setDeleteTarget({
          type: "equipment-type",
          id: equipmentType.equipment_type_id,
          label: equipmentType.equipment_type_name,
        }),
      onDeleteMainCategory: (mainCategory) =>
        setDeleteTarget({
          type: "main-category",
          id: mainCategory.main_category_id,
          label: mainCategory.main_category_name,
        }),
      onDeleteTestType: (testType) =>
        setDeleteTarget({ type: "test-type", id: testType.test_id, label: testType.test_name }),
      onEditCategory: (category) => {
        setModalError("");
        setCategoryEditor({
          mode: "edit",
          id: category.category_id,
          main_category_id: category.main_category_id || "",
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
          id: mainCategory.main_category_id,
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
    mainCategoriesQuery.isLoading ||
    categoriesQuery.isLoading ||
    testTypesQuery.isLoading ||
    equipmentTypesQuery.isLoading;
  const failed =
    mainCategoriesQuery.isError ||
    categoriesQuery.isError ||
    testTypesQuery.isError ||
    equipmentTypesQuery.isError ||
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

  return (
    <CatalogView
      categories={categoriesQuery.data}
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
      onDismissCategoryEditor={dismissCategoryEditor}
      onDismissDeleteTarget={dismissDeleteTarget}
      onDismissEquipmentTypeEditor={dismissEquipmentTypeEditor}
      onDismissMainCategoryEditor={dismissMainCategoryEditor}
      onDismissTestTypeEditor={dismissTestTypeEditor}
      onSaveCategory={saveCategory}
      onSaveEquipmentType={saveEquipmentType}
      onSaveMainCategory={saveMainCategory}
      onSaveTestType={saveTestType}
      setCategoryEditor={setCategoryEditor}
      setEquipmentTypeEditor={setEquipmentTypeEditor}
      setMainCategoryEditor={setMainCategoryEditor}
      setTestTypeEditor={setTestTypeEditor}
      testTypeColumns={testTypeColumns}
      testTypeEditor={testTypeEditor}
      testTypes={testTypesQuery.data}
    />
  );
}

type CatalogViewProps = {
  categories: Category[];
  categoryColumns: TableProps<Category>["columnDefinitions"];
  categoryEditor: CategoryEditor;
  deleteTarget: DeleteTarget;
  equipmentTypeColumns: TableProps<EquipmentType>["columnDefinitions"];
  equipmentTypeEditor: EquipmentTypeEditor;
  equipmentTypes: EquipmentType[];
  mainCategories: MainCategory[];
  mainCategoryColumns: TableProps<MainCategory>["columnDefinitions"];
  mainCategoryEditor: MainCategoryEditor;
  mainCategoryOptions: SelectProps.Option[];
  modalError: string;
  mutations: CatalogMutations;
  onCreateCategory: () => void;
  onCreateEquipmentType: () => void;
  onCreateMainCategory: () => void;
  onCreateTestType: () => void;
  onDelete: () => void;
  onDismissCategoryEditor: () => void;
  onDismissDeleteTarget: () => void;
  onDismissEquipmentTypeEditor: () => void;
  onDismissMainCategoryEditor: () => void;
  onDismissTestTypeEditor: () => void;
  onSaveCategory: (editor: NonNullable<CategoryEditor>) => void;
  onSaveEquipmentType: (editor: NonNullable<EquipmentTypeEditor>) => void;
  onSaveMainCategory: (editor: NonNullable<MainCategoryEditor>) => void;
  onSaveTestType: (editor: NonNullable<TestTypeEditor>) => void;
  setCategoryEditor: Dispatch<SetStateAction<CategoryEditor>>;
  setEquipmentTypeEditor: Dispatch<SetStateAction<EquipmentTypeEditor>>;
  setMainCategoryEditor: Dispatch<SetStateAction<MainCategoryEditor>>;
  setTestTypeEditor: Dispatch<SetStateAction<TestTypeEditor>>;
  testTypeColumns: TableProps<TestType>["columnDefinitions"];
  testTypeEditor: TestTypeEditor;
  testTypes: TestType[];
};

function CatalogView({
  categories,
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
  onCreateCategory,
  onCreateEquipmentType,
  onCreateMainCategory,
  onCreateTestType,
  onDelete,
  onDismissCategoryEditor,
  onDismissDeleteTarget,
  onDismissEquipmentTypeEditor,
  onDismissMainCategoryEditor,
  onDismissTestTypeEditor,
  onSaveCategory,
  onSaveEquipmentType,
  onSaveMainCategory,
  onSaveTestType,
  setCategoryEditor,
  setEquipmentTypeEditor,
  setMainCategoryEditor,
  setTestTypeEditor,
  testTypeColumns,
  testTypeEditor,
  testTypes,
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
            trackBy="main_category_id"
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
        onChange={setMainCategoryEditor}
        onDismiss={onDismissMainCategoryEditor}
        onSubmit={onSaveMainCategory}
        visible={Boolean(mainCategoryEditor)}
      />

      <CategoryEditorModal
        categories={categories}
        editor={categoryEditor}
        errorMessage={modalError}
        loading={mutations.saveCategoryMutation.isPending}
        mainCategoryOptions={mainCategoryOptions}
        onChange={setCategoryEditor}
        onDismiss={onDismissCategoryEditor}
        onSubmit={onSaveCategory}
        visible={Boolean(categoryEditor)}
      />

      <TestTypeEditorModal
        editor={testTypeEditor}
        errorMessage={modalError}
        loading={mutations.saveTestTypeMutation.isPending}
        onChange={setTestTypeEditor}
        onDismiss={onDismissTestTypeEditor}
        onSubmit={onSaveTestType}
        visible={Boolean(testTypeEditor)}
      />

      <EquipmentTypeEditorModal
        editor={equipmentTypeEditor}
        errorMessage={modalError}
        loading={mutations.saveEquipmentTypeMutation.isPending}
        onChange={setEquipmentTypeEditor}
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

type CatalogSummaryProps = {
  categories: Category[];
  equipmentTypes: EquipmentType[];
  mainCategories: MainCategory[];
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
  categories: Category[];
  columnDefinitions: TableProps<Category>["columnDefinitions"];
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
      trackBy="category_id"
    />
  );
}

type MainCategoryEditorModalProps = {
  editor: MainCategoryEditor;
  errorMessage: string;
  loading: boolean;
  onChange: Dispatch<SetStateAction<MainCategoryEditor>>;
  onDismiss: () => void;
  onSubmit: (editor: NonNullable<MainCategoryEditor>) => void;
  visible: boolean;
};

function MainCategoryEditorModal({
  editor,
  errorMessage,
  loading,
  onChange,
  onDismiss,
  onSubmit,
  visible,
}: MainCategoryEditorModalProps) {
  const footer = useMemo(
    () => (
      <SpaceBetween direction="horizontal" size="xs">
        <Button onClick={onDismiss}>Cancel</Button>
        <Button loading={loading} variant="primary" onClick={() => editor && onSubmit(editor)}>
          {editor?.mode === "edit" ? "Save changes" : "Create main category"}
        </Button>
      </SpaceBetween>
    ),
    [editor, loading, onDismiss, onSubmit]
  );

  return (
    <Modal
      visible={visible}
      header={editor?.mode === "edit" ? "Edit main category" : "Create main category"}
      onDismiss={onDismiss}
      footer={footer}
    >
      <SpaceBetween direction="vertical" size="l">
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        <FormField label="Main category name">
          <Input
            value={editor?.main_category_name || ""}
            onChange={({ detail }) =>
              onChange((current) => current && { ...current, main_category_name: detail.value })
            }
          />
        </FormField>
        <FormField label="Main category order">
          <Input
            inputMode="numeric"
            value={editor?.sort_order || ""}
            onChange={({ detail }) =>
              onChange((current) => current && { ...current, sort_order: detail.value })
            }
          />
        </FormField>
        <FormField label="Description">
          <Textarea
            rows={6}
            value={editor?.description || ""}
            onChange={({ detail }) =>
              onChange((current) => current && { ...current, description: detail.value })
            }
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}

type CategoryEditorModalProps = {
  categories: Category[];
  editor: CategoryEditor;
  errorMessage: string;
  loading: boolean;
  mainCategoryOptions: SelectProps.Option[];
  onChange: Dispatch<SetStateAction<CategoryEditor>>;
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
  onChange,
  onDismiss,
  onSubmit,
  visible,
}: CategoryEditorModalProps) {
  const selectedMainCategoryOption =
    mainCategoryOptions.find((option) => option.value === editor?.main_category_id) ?? null;
  const footer = useMemo(
    () => (
      <SpaceBetween direction="horizontal" size="xs">
        <Button onClick={onDismiss}>Cancel</Button>
        <Button loading={loading} variant="primary" onClick={() => editor && onSubmit(editor)}>
          {editor?.mode === "edit" ? "Save changes" : "Create category"}
        </Button>
      </SpaceBetween>
    ),
    [editor, loading, onDismiss, onSubmit]
  );

  return (
    <Modal
      visible={visible}
      header={editor?.mode === "edit" ? "Edit category" : "Create category"}
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
                onChange((current) =>
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
            value={editor?.sort_order || ""}
            onChange={({ detail }) =>
              onChange((current) => current && { ...current, sort_order: detail.value })
            }
          />
        </FormField>
        <FormField label="Category name">
          <Input
            value={editor?.category_name || ""}
            onChange={({ detail }) =>
              onChange((current) => current && { ...current, category_name: detail.value })
            }
          />
        </FormField>
        <FormField label="Description">
          <Textarea
            rows={6}
            value={editor?.description || ""}
            onChange={({ detail }) =>
              onChange((current) => current && { ...current, description: detail.value })
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
  onChange: Dispatch<SetStateAction<TestTypeEditor>>;
  onDismiss: () => void;
  onSubmit: (editor: NonNullable<TestTypeEditor>) => void;
  visible: boolean;
};

function TestTypeEditorModal({
  editor,
  errorMessage,
  loading,
  onChange,
  onDismiss,
  onSubmit,
  visible,
}: TestTypeEditorModalProps) {
  const footer = useMemo(
    () => (
      <SpaceBetween direction="horizontal" size="xs">
        <Button onClick={onDismiss}>Cancel</Button>
        <Button loading={loading} variant="primary" onClick={() => editor && onSubmit(editor)}>
          {editor?.mode === "edit" ? "Save changes" : "Create test type"}
        </Button>
      </SpaceBetween>
    ),
    [editor, loading, onDismiss, onSubmit]
  );

  return (
    <Modal
      visible={visible}
      header={editor?.mode === "edit" ? "Edit test type" : "Create test type"}
      onDismiss={onDismiss}
      footer={footer}
    >
      <SpaceBetween direction="vertical" size="l">
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        <FormField label="Test type name">
          <Input
            value={editor?.test_name || ""}
            onChange={({ detail }) =>
              onChange((current) => current && { ...current, test_name: detail.value })
            }
          />
        </FormField>
        <FormField label="Validity duration (months)">
          <Input
            inputMode="numeric"
            value={editor?.validity_duration || ""}
            onChange={({ detail }) =>
              onChange((current) => current && { ...current, validity_duration: detail.value })
            }
          />
        </FormField>
        <FormField label="Description">
          <Textarea
            rows={6}
            value={editor?.description || ""}
            onChange={({ detail }) =>
              onChange((current) => current && { ...current, description: detail.value })
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
  onChange: Dispatch<SetStateAction<EquipmentTypeEditor>>;
  onDismiss: () => void;
  onSubmit: (editor: NonNullable<EquipmentTypeEditor>) => void;
  visible: boolean;
};

function EquipmentTypeEditorModal({
  editor,
  errorMessage,
  loading,
  onChange,
  onDismiss,
  onSubmit,
  visible,
}: EquipmentTypeEditorModalProps) {
  const footer = useMemo(
    () => (
      <SpaceBetween direction="horizontal" size="xs">
        <Button onClick={onDismiss}>Cancel</Button>
        <Button loading={loading} variant="primary" onClick={() => editor && onSubmit(editor)}>
          {editor?.mode === "edit" ? "Save changes" : "Create equipment type"}
        </Button>
      </SpaceBetween>
    ),
    [editor, loading, onDismiss, onSubmit]
  );

  return (
    <Modal
      visible={visible}
      header={editor?.mode === "edit" ? "Edit equipment type" : "Create equipment type"}
      onDismiss={onDismiss}
      footer={footer}
    >
      <SpaceBetween direction="vertical" size="l">
        {errorMessage ? <Alert type="error">{errorMessage}</Alert> : null}
        <FormField label="Equipment type name">
          <Input
            value={editor?.equipment_type_name || ""}
            onChange={({ detail }) =>
              onChange((current) => current && { ...current, equipment_type_name: detail.value })
            }
          />
        </FormField>
        <FormField label="Equipment type order">
          <Input
            inputMode="numeric"
            value={editor?.sort_order || ""}
            onChange={({ detail }) =>
              onChange((current) => current && { ...current, sort_order: detail.value })
            }
          />
        </FormField>
        <FormField label="Description">
          <Textarea
            rows={6}
            value={editor?.description || ""}
            onChange={({ detail }) =>
              onChange((current) => current && { ...current, description: detail.value })
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
