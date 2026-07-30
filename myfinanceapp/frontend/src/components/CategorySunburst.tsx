// Two-level (category -> subcategory) breakdown chart shared by the Reports page.
// The inner ring is the main category, the outer ring its subcategories.
import { useMemo } from "react";
import { ResponsiveSunburst } from "@nivo/sunburst";

export interface SunburstSlice {
  name: string;
  value: number;
  subcategories?: { name: string; value: number }[];
}

interface CategorySunburstProps {
  slices: SunburstSlice[];
  /** Formats a value for arc tooltips (usually a currency formatter) */
  formatValue: (value: number) => string;
  /** Called when an arc is clicked; subcategory is undefined for inner arcs */
  onSelect?: (selection: { category: string; subcategory?: string }) => void;
  /** Chart height in pixels */
  height?: number;
  /** Message shown when there is nothing to plot */
  emptyMessage?: string;
}

// Nivo needs globally unique node ids, but subcategory names repeat across
// categories ("Other", "Fees", ...). Children are keyed by "Parent > Child" so
// the ids stay unique and still read correctly if the label accessor is unused.
const ID_SEPARATOR = " › ";

const CATEGORY_COLORS = [
  "#ef4444",
  "#f59e0b",
  "#f97316",
  "#ec4899",
  "#d946ef",
  "#a855f7",
  "#8b5cf6",
  "#6366f1",
];

interface SunburstNode {
  id: string;
  label: string;
  category?: string;
  subcategory?: string;
  value?: number;
  children?: SunburstNode[];
}

/** Builds the nivo tree, dropping empty slices so no zero-width arcs render. */
function buildTree(slices: SunburstSlice[]): SunburstNode {
  const children = slices
    .filter((slice) => slice.value > 0)
    .map((slice) => {
      const subNodes = (slice.subcategories || [])
        .filter((sub) => sub.value > 0)
        .map((sub) => ({
          id: `${slice.name}${ID_SEPARATOR}${sub.name}`,
          label: sub.name,
          category: slice.name,
          subcategory: sub.name,
          value: sub.value,
        }));

      // Without subcategories the category itself is the leaf.
      return subNodes.length > 0
        ? {
            id: slice.name,
            label: slice.name,
            category: slice.name,
            children: subNodes,
          }
        : {
            id: slice.name,
            label: slice.name,
            category: slice.name,
            value: slice.value,
          };
    });

  return { id: "Total", label: "Total", children };
}

export default function CategorySunburst({
  slices,
  formatValue,
  onSelect,
  height = 300,
  emptyMessage = "No category data",
}: CategorySunburstProps) {
  const data = useMemo(() => buildTree(slices), [slices]);

  if (!data.children?.length) {
    return (
      <div
        className="flex justify-center items-center"
        style={{ height: `${height}px` }}
      >
        <p className="text-foreground-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div style={{ height: `${height}px` }} className={onSelect ? "cursor-pointer" : ""}>
      <ResponsiveSunburst
        data={data}
        id="id"
        value="value"
        valueFormat={(value) => formatValue(value as number)}
        onClick={(node: any) => {
          const datum = node?.data;
          if (!onSelect || !datum?.category) return;
          onSelect({
            category: datum.category,
            subcategory: datum.subcategory,
          });
        }}
        margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
        cornerRadius={2}
        borderWidth={2}
        borderColor="#0a0a0a"
        colors={CATEGORY_COLORS}
        childColor={{ from: "color", modifiers: [["brighter", 0.35]] }}
        enableArcLabels={true}
        arcLabel={(node: any) => node.data?.label ?? node.id}
        arcLabelsSkipAngle={15}
        arcLabelsTextColor={{ from: "color", modifiers: [["darker", 2.5]] }}
        animate={true}
        theme={{
          tooltip: {
            container: {
              background: "#0a0a0a",
              border: "1px solid #2a2a2a",
              borderRadius: "8px",
              fontSize: "12px",
            },
          },
        }}
      />
    </div>
  );
}
