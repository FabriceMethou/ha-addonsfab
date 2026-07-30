// Category breakdown chart shared by the Reports page.
// A single ring of main categories: the subcategory split is read from the
// hover panel rather than drawn as an outer ring, which keeps the chart legible
// when a category has many subcategories.
import { useMemo } from "react";
import { ResponsiveSunburst } from "@nivo/sunburst";

export interface SunburstSlice {
  name: string;
  value: number;
  subcategories?: { name: string; value: number }[];
}

interface CategorySunburstProps {
  slices: SunburstSlice[];
  /** Formats a value for the hover panel (usually a currency formatter) */
  formatValue: (value: number) => string;
  /** Called when an arc is clicked */
  onSelect?: (selection: { category: string; subcategory?: string }) => void;
  /** Chart height in pixels */
  height?: number;
  /** Message shown when there is nothing to plot */
  emptyMessage?: string;
}

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

/** How many subcategories to list before collapsing the rest into "+N more". */
const TOOLTIP_SUBCATEGORY_LIMIT = 12;

interface SunburstNode {
  id: string;
  label: string;
  category?: string;
  value?: number;
  /** The category's subcategory split, read by the hover panel */
  subcategories?: { name: string; value: number }[];
  children?: SunburstNode[];
}

/** Builds the nivo tree, dropping empty slices so no zero-width arcs render. */
function buildTree(slices: SunburstSlice[]): SunburstNode {
  return {
    id: "Total",
    label: "Total",
    children: slices
      .filter((slice) => slice.value > 0)
      .map((slice) => ({
        id: slice.name,
        label: slice.name,
        category: slice.name,
        value: slice.value,
        subcategories: slice.subcategories,
      })),
  };
}

const share = (part: number, whole: number) =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—";

export default function CategorySunburst({
  slices,
  formatValue,
  onSelect,
  height = 300,
  emptyMessage = "No category data",
}: CategorySunburstProps) {
  const data = useMemo(() => buildTree(slices), [slices]);

  // Hover panel: the category's own amount and share, then its subcategories
  // with amount and share of the category.
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
          // Matches the app's popover style (see shadcn SelectContent): opaque
          // background-paper, never the translucent card/surface tokens.
          <div className="min-w-[220px] rounded-md border border-border bg-background-paper px-3 py-2 text-sm shadow-glass">
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-semibold text-foreground">
                {datum.label ?? node.id}
              </span>
              <span className="text-foreground-muted">
                {node.percentage?.toFixed(1)}%
              </span>
            </div>
            <div className="text-foreground">{formatValue(node.value)}</div>

            {shown.length > 0 && (
              <div className="mt-2 space-y-1 border-t border-border pt-2">
                {shown.map((sub) => (
                  <div
                    key={sub.name}
                    className="flex items-baseline justify-between gap-4"
                  >
                    <span className="text-foreground-muted">{sub.name}</span>
                    <span className="whitespace-nowrap text-foreground">
                      {formatValue(sub.value)}
                      <span className="ml-1 text-foreground-muted">
                        {share(sub.value, node.value)}
                      </span>
                    </span>
                  </div>
                ))}
                {hidden > 0 && (
                  <div className="text-foreground-subtle">+{hidden} more</div>
                )}
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
    >
      <ResponsiveSunburst
        data={data}
        id="id"
        value="value"
        valueFormat={(value) => formatValue(value as number)}
        onClick={(node: any) => {
          const datum = node?.data;
          if (!onSelect || !datum?.category) return;
          onSelect({ category: datum.category });
        }}
        margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
        cornerRadius={2}
        borderWidth={2}
        borderColor="#0a0a0a"
        colors={CATEGORY_COLORS}
        enableArcLabels={true}
        arcLabel={(node: any) => node.data?.label ?? node.id}
        arcLabelsSkipAngle={15}
        arcLabelsTextColor={{ from: "color", modifiers: [["darker", 2.5]] }}
        tooltip={Tooltip}
        animate={true}
        theme={{
          // The panel above owns all of its styling, so strip nivo's default
          // wrapper (white background, padding, shadow) to avoid a second box.
          tooltip: {
            container: {
              background: "transparent",
              padding: 0,
              border: "none",
              borderRadius: 0,
              boxShadow: "none",
            },
          },
        }}
      />
    </div>
  );
}
