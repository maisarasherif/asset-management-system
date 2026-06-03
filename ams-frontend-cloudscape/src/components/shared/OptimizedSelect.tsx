import DesignMultiselect, {
  type MultiselectProps,
} from "@cloudscape-design/components/multiselect";
import DesignSelect, { type SelectProps } from "@cloudscape-design/components/select";
import { forwardRef } from "react";

export const Select = forwardRef<SelectProps.Ref, SelectProps>(
  (
    {
      filteringAriaLabel,
      filteringPlaceholder,
      filteringType,
      options,
      virtualScroll,
      ...props
    },
    ref
  ) => (
    <DesignSelect
      {...props}
      ref={ref}
      filteringAriaLabel={filteringAriaLabel || "Filter options"}
      filteringPlaceholder={filteringPlaceholder || "Find option"}
      filteringType={filteringType || "auto"}
      options={options}
      virtualScroll={virtualScroll ?? true}
    />
  )
);

Select.displayName = "OptimizedSelect";

export const Multiselect = forwardRef<MultiselectProps.Ref, MultiselectProps>(
  (
    {
      filteringAriaLabel,
      filteringPlaceholder,
      filteringType,
      options,
      virtualScroll,
      ...props
    },
    ref
  ) => (
    <DesignMultiselect
      {...props}
      ref={ref}
      filteringAriaLabel={filteringAriaLabel || "Filter options"}
      filteringPlaceholder={filteringPlaceholder || "Find option"}
      filteringType={filteringType || "auto"}
      options={options}
      virtualScroll={virtualScroll ?? true}
    />
  )
);

Multiselect.displayName = "OptimizedMultiselect";
