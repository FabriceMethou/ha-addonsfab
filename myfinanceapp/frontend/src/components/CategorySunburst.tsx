// Category breakdown chart shared by the Reports page.
// At rest it is a single ring of main categories. Hovering a category expands
// just that one into an outer ring of its subcategories — the chart zooms into
// the slice under the pointer instead of permanently showing every subcategory.
import { useMemo, useState } from "react";
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
  /** Category total, carried on children so the tooltip can show their share */
  parentValue?: number;
  /** The category's full subcategory list, kept even while collapsed so the
   *  tooltip can show the split without the outer ring being drawn */
  subcategories?: { name: string; value: number }[];
  children?: SunburstNode[];
}

/**
 * Builds the nivo tree, dropping empty slices so no zero-width arcs render.
 *
 * Only `expandedCategory` gets subcategory children; every other category stays
 * a leaf, so the chart shows one ring until a category is hovered. Because the
 * children sum to the category total, expanding never changes an arc's angular
 * span — the arc under the pointer stays put and only grows a second ring.
 */
function buildTree(
  slices: SunburstSlice[],
  expandedCategory: string | null,
): SunburstNode {
  const children = slices
    .filter((slice) => slice.value > 0)
    .map((slice) => {
      const subNodes =
        slice.name === expandedCategory
          ? (slice.subcategories || [])
              .filter((sub) => sub.value > 0)
              .map((sub) => ({
                id: `${slice.name}${ID_SEPARATOR}${sub.name}`,
                label: sub.name,
                category: slice.name,
                subcategory: sub.name,
                value: sub.value,
                parentValue: slice.value,
              }))
          : [];

      // Collapsed (or subcategory-less) categories are leaves.
      return subNodes.length > 0
        ? {
            id: slice.name,
            label: slice.name,
            category: slice.name,
            subcategories: slice.subcategories,
            children: subNodes,
          }
        : {
            id: slice.name,
            label: slice.name,
            category: slice.name,
            subcategories: slice.subcategories,
            value: slice.value,
          };
    });

  return { id: "Total", label: "Total", children };
}

/** How many subcategories to list before collapsing the rest into "+N more". */
const TOOLTIP_SUBCATEGORY_LIMIT = 8;

const share = (part: number, whole: number) =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—";

export default function CategorySunburst({
  slices,
  formatValue,
  onSelect,
  height = 300,
  emptyMessage = "No category data",
}: CategorySunburstProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const data = useMemo(
    () => buildTree(slices, expandedCategory),
    [slices, expandedCategory],
  );

  // Hovering a category lists its subcategories; hovering a subcategory shows
  // its share of the parent category.
  const Tooltip = useMemo(
    () =>
      function SunburstTooltip(node: any) {
        const datum: SunburstNode = node?.data ?? {};
        const subcategories = (datum.subcategories ?? []).filter(
          (sub) => sub.value > 0,
        );
        const shown = subcategories.slice(0, TOOLTIP_SUBCATEGORY_LIMIT);
        const hidden = subcategories.length - shown.length;

        return (
          <div className="min-w-[180px] text-foreground">
            <div className="font-semibold">{datum.label ?? node.id}</div>
            <div className="text-foreground-muted">
              {formatValue(node.value)} · {node.percentage?.toFixed(1)}% of
              total
            </div>

            {shown.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border space-y-0.5">
                {shown.map((sub) => (
                  <div key={sub.name} className="flex justify-between gap-4">
                    <span className="text-foreground-muted">{sub.name}</span>
                    <span>
                      {formatValue(sub.value)}
                      <span className="text-foreground-muted">
                        {" "}
                        ({share(sub.value, node.value)})
                      </span>
                    </span>
                  </div>
                ))}
                {hidden > 0 && (
                  <div className="text-foreground-muted">+{hidden} more</div>
                )}
              </div>
            )}

            {datum.subcategory && (
              <div className="mt-2 pt-2 border-t border-border text-foreground-muted">
                {share(node.value, datum.parentValue ?? 0)} of {datum.category}
              </div>
            )}
          </div>
        );
      },
    [formatValue],
  );

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
    <div
      style={{ height: `${height}px` }}
      className={onSelect ? "cursor-pointer" : ""}
      // Collapse only once the pointer leaves the whole chart. Collapsing on
      // arc-leave would fight the pointer: expanding moves the arc boundaries
      // under it, which would immediately re-fire leave/enter in a loop.
      onMouseLeave={() => setExpandedCategory(null)}
    >
      <ResponsiveSunburst
        data={data}
        id="id"
        value="value"
        valueFormat={(value) => formatValue(value as number)}
        onMouseEnter={(node: any) =>
          setExpandedCategory(node?.data?.category ?? null)
        }
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
        tooltip={Tooltip}
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
