import { Pencil } from "lucide-react";
import { MultiSelect } from "@/components/multi-select";
import {
  BOARD_HEADER_FILTER_SECTION_LABEL_CLASS,
  BOARD_HEADER_SECTION_EDIT_ICON_SLOT_CLASS,
  boardHeaderSectionEditIconButtonClass,
} from "./boardHeaderButtonStyles";
import { cn } from "@/lib/utils";

export interface BoardHeaderMultiSelectOption {
  id: string;
  label: string;
  color?: string;
  /** Board default release — star in the dropdown list. */
  markAsDefault?: boolean;
}

interface BoardHeaderMultiSelectProps {
  sectionLabel: string;
  allLabel: string;
  chooseAriaLabel: string;
  clearAllLabel: string;
  removeItemAriaLabel: (label: string) => string;
  options: BoardHeaderMultiSelectOption[];
  selectedIds: string[];
  headerHovered?: boolean;
  onChange: (selectedIds: string[]) => void;
  onOpenEditor?: () => void;
  editButtonAriaLabel?: string;
}

/** Release filter: every row gets a fixed-size circle — filled when colored, border-only when not (aligned list). */
function ReleaseFilterColorSwatch({
  color,
  className,
}: {
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "box-border inline-block shrink-0 rounded-full border bg-background",
        color ? "border-transparent" : "border-border",
        className,
      )}
      style={color ? { backgroundColor: color } : undefined}
      aria-hidden
    />
  );
}

export function BoardHeaderMultiSelect({
  sectionLabel,
  allLabel,
  chooseAriaLabel: _chooseAriaLabel,
  clearAllLabel: _clearAllLabel,
  removeItemAriaLabel: _removeItemAriaLabel,
  options,
  selectedIds,
  headerHovered,
  onChange,
  onOpenEditor,
  editButtonAriaLabel,
}: BoardHeaderMultiSelectProps) {
  const effectiveSelectedIds =
    selectedIds.length === options.length ? [] : selectedIds;

  const applySelection = (nextSelectedIds: string[]) => {
    const orderedIds = options
      .map((option) => option.id)
      .filter((id) => nextSelectedIds.includes(id));
    // Selecting every option is the same as "no filter", so collapse back to the empty/all state.
    if (orderedIds.length === options.length) {
      onChange([]);
      return;
    }
    // Re-sort against the source options so clicks/removals preserve the canonical display order.
    onChange(orderedIds);
  };

  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5"
      role="group"
      aria-label={`${sectionLabel} filter`}
    >
      <span className="inline-flex items-center gap-1">
        {onOpenEditor && editButtonAriaLabel ? (
          <span className={BOARD_HEADER_SECTION_EDIT_ICON_SLOT_CLASS}>
            <button
              type="button"
              tabIndex={headerHovered ? 0 : -1}
              className={boardHeaderSectionEditIconButtonClass(Boolean(headerHovered))}
              aria-label={editButtonAriaLabel}
              title={editButtonAriaLabel}
              onClick={(e) => {
                e.stopPropagation();
                onOpenEditor();
              }}
            >
              <Pencil className="size-3" aria-hidden />
            </button>
          </span>
        ) : null}
        <span className={BOARD_HEADER_FILTER_SECTION_LABEL_CLASS}>{sectionLabel}</span>
      </span>
      <div className="min-w-0 flex-1 basis-[24rem]">
        {/* Use the upstream shadcn multi-select so chip layout stays inside the filter cell and responds predictably. */}
        <MultiSelect
          options={options.map((option) => ({
            value: option.id,
            label: option.label,
            markAsDefault: option.markAsDefault,
            icon: ({ className }: { className?: string }) => (
              <ReleaseFilterColorSwatch color={option.color} className={className} />
            ),
          }))}
          defaultValue={effectiveSelectedIds}
          onValueChange={applySelection}
          placeholder={allLabel}
          maxCount={2}
          singleLine
          responsive={{
            mobile: { maxCount: 2, compactMode: true, hideIcons: false },
            tablet: { maxCount: 2, compactMode: false, hideIcons: false },
            desktop: { maxCount: 2, compactMode: false, hideIcons: false },
          }}
          minWidth="0px"
          maxWidth="100%"
          hideSelectAll
          searchable={options.length > 8}
          className="w-full border-border bg-muted/40 text-foreground hover:bg-muted [&_[data-slot=badge]]:h-6 [&_[data-slot=badge]]:border-border/70 [&_[data-slot=badge]]:bg-background/85 [&_[data-slot=badge]]:px-2.5 [&_[data-slot=badge]]:text-sm [&_[data-slot=badge]]:font-medium [&_[data-slot=badge]]:text-foreground"
          popoverClassName="z-[100]"
        />
      </div>
    </div>
  );
}
