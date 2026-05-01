import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import type { ThemeSwatchOption } from "../utils/themeSwatchOptions";

/**
 * テーマ選択用の軽量 custom menu。native `<select>` だと option 内に色チップを置けないので、
 * テーマ系 select だけこのコンポーネントに置き換える。
 *
 * 状態は内部の open/close のみ。選択値は親 component で保持する。
 */

export type ThemeSwatchSelectGroup<V extends string = string> = {
  label: string;
  options: ThemeSwatchOption<V>[];
};

type ThemeSwatchSelectProps<V extends string = string> = {
  value: V;
  options: ThemeSwatchOption<V>[];
  onChange: (value: V) => void;
  groups?: ThemeSwatchSelectGroup<V>[];
  ariaLabel: string;
  className?: string;
};

function Swatches({ swatches }: { swatches: string[] }) {
  if (swatches.length === 0) return null;
  return (
    <span className="theme-swatch-select-swatches" aria-hidden="true">
      {swatches.map((color, idx) => (
        <span
          key={`${color}-${idx}`}
          className="theme-swatch-select-swatch"
          style={{ backgroundColor: color }}
        />
      ))}
    </span>
  );
}

type PopoverPosition = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

const POPOVER_GAP = 4;
const POPOVER_DESIRED_MAX_HEIGHT = 320;
const POPOVER_MIN_BELOW_HEIGHT = 160;

export function ThemeSwatchSelect<V extends string>({
  value,
  options,
  onChange,
  groups,
  ariaLabel,
  className,
}: ThemeSwatchSelectProps<V>) {
  const [open, setOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState<PopoverPosition | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listboxId = useId();

  const flatOptions = useMemo<ThemeSwatchOption<V>[]>(() => {
    const all: ThemeSwatchOption<V>[] = [...options];
    if (groups) {
      for (const group of groups) {
        all.push(...group.options);
      }
    }
    return all;
  }, [options, groups]);

  const currentOption = flatOptions.find((opt) => opt.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setPopoverPos(null);
      return;
    }
    const compute = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportH = window.innerHeight;
      const spaceBelow = viewportH - rect.bottom - POPOVER_GAP;
      const spaceAbove = rect.top - POPOVER_GAP;
      const placeAbove =
        spaceBelow < POPOVER_MIN_BELOW_HEIGHT && spaceAbove > spaceBelow;
      const maxHeight = Math.max(
        120,
        Math.min(
          POPOVER_DESIRED_MAX_HEIGHT,
          placeAbove ? spaceAbove : spaceBelow,
        ),
      );
      setPopoverPos({
        left: rect.left,
        top: placeAbove
          ? Math.max(POPOVER_GAP, rect.top - POPOVER_GAP - maxHeight)
          : rect.bottom + POPOVER_GAP,
        width: rect.width,
        maxHeight,
      });
    };
    compute();
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [open]);

  const handleSelect = useCallback(
    (next: V) => {
      onChange(next);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onChange],
  );

  const renderOption = (option: ThemeSwatchOption<V>) => {
    const isSelected = option.value === value;
    return (
      <li
        key={option.value}
        role="option"
        aria-selected={isSelected}
        className={`theme-swatch-select-option${isSelected ? " is-selected" : ""}`}
      >
        <button
          type="button"
          className="theme-swatch-select-option-btn"
          onClick={() => handleSelect(option.value)}
        >
          <span className="theme-swatch-select-option-label">
            {option.label}
          </span>
          <Swatches swatches={option.swatches} />
          <span className="theme-swatch-select-option-check" aria-hidden="true">
            {isSelected && <IconCheck size={14} stroke={2} />}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div
      ref={rootRef}
      className={`theme-swatch-select${className ? ` ${className}` : ""}${open ? " is-open" : ""}`}
    >
      <button
        ref={triggerRef}
        type="button"
        className="theme-swatch-select-trigger setting-select"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="theme-swatch-select-trigger-label">
          {currentOption?.label ?? ""}
        </span>
        <Swatches swatches={currentOption?.swatches ?? []} />
        <IconChevronDown
          className="theme-swatch-select-trigger-chevron"
          size={14}
          stroke={1.8}
          aria-hidden="true"
        />
      </button>
      {open && popoverPos && (
        <div
          className="theme-swatch-select-popover"
          style={{
            position: "fixed",
            left: popoverPos.left,
            top: popoverPos.top,
            width: popoverPos.width,
            maxHeight: popoverPos.maxHeight,
          }}
        >
          <ul
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            className="theme-swatch-select-list"
          >
            {options.map(renderOption)}
            {groups?.map((group) =>
              group.options.length === 0 ? null : (
                <li
                  key={`group-${group.label}`}
                  className="theme-swatch-select-group"
                  role="presentation"
                >
                  <div
                    className="theme-swatch-select-group-label"
                    role="presentation"
                  >
                    {group.label}
                  </div>
                  <ul
                    role="group"
                    aria-label={group.label}
                    className="theme-swatch-select-group-list"
                  >
                    {group.options.map(renderOption)}
                  </ul>
                </li>
              ),
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
