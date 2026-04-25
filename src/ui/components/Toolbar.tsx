import {
  IconSettings,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBlockquote,
  IconBold,
  IconChevronDown,
  IconSquareCheck,
  IconCode,
  IconCodeDots,
  IconDeviceFloppy,
  IconDiamond,
  IconEraser,
  IconEye,
  IconEyeOff,
  IconFileCode,
  IconPilcrow,
  IconFolderOpen,
  IconH1,
  IconH2,
  IconH3,
  IconH4,
  IconH5,
  IconH6,
  IconHeading,
  IconHeadingOff,
  IconHighlight,
  IconItalic,
  IconList,
  IconListNumbers,
  IconLink,
  IconPhoto,
  IconSeparatorHorizontal,
  IconSeparatorVertical,
  IconStrikethrough,
  IconSwitchHorizontal,
  IconSwitchVertical,
  IconNumber123,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { MouseEventHandler } from "react";
import type { CommandAvailability } from "../../editor-core/types";
import type { UiLanguageMode, WritingMode } from "../../settings/types";
import { createUiTextGetter } from "../i18n/uiText";
import {
  getPlainFormattingUnavailableMessage,
  resolvePlainModeKind,
} from "../utils/plainModeCommandGate";

const TOOLBAR_ICON_SIZE = 18;
const TOOLBAR_ICON_STROKE = 1.1;

type ToolbarProps = {
  rubyVisible: boolean;
  writingMode: WritingMode;
  uiLanguageMode: UiLanguageMode;
  availability: CommandAvailability;
  paragraphPlainModeActive: boolean;
  fullPlainEditActive: boolean;
  displaySettingsOpen: boolean;
  onRunMarkCommand: (
    commandName: "bold" | "italic" | "strike" | "highlight",
  ) => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleInlineCode: () => void;
  onInsertHorizontalRule: () => void;
  onToggleHeading: (level: number) => void;
  onToggleBulletList: () => void;
  onToggleOrderedList: () => void;
  onToggleChecklist: () => void;
  onToggleBlockquote: () => void;
  onToggleCodeBlock: () => void;
  onClearFormat: () => void;
  onSetOrUnsetLink: () => void;
  onInsertImage: () => void;
  onInsertRubyBouten: () => void;
  onToggleTcy: () => void;
  onToggleRubyVisible: () => void;
  onToggleWritingMode: () => void;
  onToggleParagraphPlainMode: () => void;
  onToggleFullPlainEdit: () => void;
  onOpenDisplaySettings: () => void;
  onShowEditorInlineHint?: (message: string) => void;
  onLoad: MouseEventHandler<HTMLButtonElement>;
  onSave: MouseEventHandler<HTMLButtonElement>;
};

export function Toolbar({
  rubyVisible,
  writingMode,
  uiLanguageMode,
  availability,
  paragraphPlainModeActive,
  fullPlainEditActive,
  displaySettingsOpen,
  onRunMarkCommand,
  onUndo,
  onRedo,
  onToggleInlineCode,
  onInsertHorizontalRule,
  onToggleHeading,
  onToggleBulletList,
  onToggleOrderedList,
  onToggleChecklist,
  onToggleBlockquote,
  onToggleCodeBlock,
  onClearFormat,
  onSetOrUnsetLink,
  onInsertImage,
  onInsertRubyBouten,
  onToggleTcy,
  onToggleRubyVisible,
  onToggleWritingMode,
  onToggleParagraphPlainMode,
  onToggleFullPlainEdit,
  onOpenDisplaySettings,
  onShowEditorInlineHint,
  onLoad,
  onSave,
}: ToolbarProps) {
  const t = createUiTextGetter(uiLanguageMode);
  const isVertical = writingMode === "vertical-rl";
  const [headingMenuOpen, setHeadingMenuOpen] = useState(false);
  const headingMenuRef = useRef<HTMLDivElement | null>(null);
  const headingItems = [
    { id: "h1", label: t("editor.heading.level1"), level: 1, icon: IconH1 },
    { id: "h2", label: t("editor.heading.level2"), level: 2, icon: IconH2 },
    { id: "h3", label: t("editor.heading.level3"), level: 3, icon: IconH3 },
    { id: "h4", label: t("editor.heading.level4"), level: 4, icon: IconH4 },
    { id: "h5", label: t("editor.heading.level5"), level: 5, icon: IconH5 },
    { id: "h6", label: t("editor.heading.level6"), level: 6, icon: IconH6 },
  ] as const;
  const plainModeKind = resolvePlainModeKind({
    paragraphPlainModeActive,
    fullPlainEditActive,
  });
  const plainFormattingBlocked = plainModeKind !== null;
  const plainFormattingTooltip = plainModeKind
    ? getPlainFormattingUnavailableMessage(plainModeKind)
    : "";

  useEffect(() => {
    if (!headingMenuOpen) return;

    const onMouseDown = (event: MouseEvent) => {
      if (!headingMenuRef.current) return;
      if (headingMenuRef.current.contains(event.target as Node)) return;
      setHeadingMenuOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setHeadingMenuOpen(false);
    };

    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [headingMenuOpen]);

  useEffect(() => {
    if (!plainFormattingBlocked) return;
    setHeadingMenuOpen(false);
  }, [plainFormattingBlocked]);

  const withPlainFormattingGuard = (action: () => void) => () => {
    if (plainModeKind) {
      onShowEditorInlineHint?.(plainFormattingTooltip);
      setHeadingMenuOpen(false);
      return;
    }
    action();
  };

  const getFormattingButtonProps = (tooltip: string) => ({
    "aria-disabled": plainFormattingBlocked ? true : undefined,
    "data-tooltip": plainFormattingBlocked ? plainFormattingTooltip : tooltip,
    title: plainFormattingBlocked ? plainFormattingTooltip : undefined,
  });

  return (
    <section className="toolbar">
      <button
        className="toolbar-btn-iconized toolbar-btn-icon-only"
        onClick={onUndo}
        disabled={!availability.canUndo}
        type="button"
        data-tooltip={t("common.undo")}
        aria-label={t("common.undo")}
      >
        <IconArrowBackUp
          size={TOOLBAR_ICON_SIZE}
          stroke={TOOLBAR_ICON_STROKE}
        />
      </button>
      <button
        className="toolbar-btn-iconized toolbar-btn-icon-only"
        onClick={onRedo}
        disabled={!availability.canRedo}
        type="button"
        data-tooltip={t("common.redo")}
        aria-label={t("common.redo")}
      >
        <IconArrowForwardUp
          size={TOOLBAR_ICON_SIZE}
          stroke={TOOLBAR_ICON_STROKE}
        />
      </button>
      <span className="toolbar-sep">|</span>
      <button
        className="toolbar-btn-iconized toolbar-btn-icon-only"
        onClick={withPlainFormattingGuard(() => onRunMarkCommand("bold"))}
        disabled={!plainFormattingBlocked && !availability.canBold}
        type="button"
        aria-label={t("editor.bold")}
        {...getFormattingButtonProps(t("editor.bold"))}
      >
        <IconBold size={TOOLBAR_ICON_SIZE} stroke={TOOLBAR_ICON_STROKE} />
      </button>
      <button
        className="toolbar-btn-iconized toolbar-btn-icon-only"
        onClick={withPlainFormattingGuard(() => onRunMarkCommand("italic"))}
        disabled={!plainFormattingBlocked && !availability.canItalic}
        type="button"
        aria-label={t("editor.italic")}
        {...getFormattingButtonProps(t("editor.italic"))}
      >
        <IconItalic size={TOOLBAR_ICON_SIZE} stroke={TOOLBAR_ICON_STROKE} />
      </button>
      <button
        className="toolbar-btn-iconized toolbar-btn-icon-only"
        onClick={withPlainFormattingGuard(() => onRunMarkCommand("strike"))}
        disabled={!plainFormattingBlocked && !availability.canStrike}
        type="button"
        aria-label={t("editor.strike")}
        {...getFormattingButtonProps(t("editor.strike"))}
      >
        <IconStrikethrough
          size={TOOLBAR_ICON_SIZE}
          stroke={TOOLBAR_ICON_STROKE}
        />
      </button>
      <button
        className="toolbar-btn-iconized toolbar-btn-icon-only"
        onClick={withPlainFormattingGuard(() => onRunMarkCommand("highlight"))}
        disabled={!plainFormattingBlocked && !availability.canHighlight}
        type="button"
        aria-label={t("editor.highlight")}
        {...getFormattingButtonProps(t("editor.highlight"))}
      >
        <IconHighlight size={TOOLBAR_ICON_SIZE} stroke={TOOLBAR_ICON_STROKE} />
      </button>
      <button
        className="toolbar-btn-iconized toolbar-btn-icon-only"
        onClick={withPlainFormattingGuard(onToggleInlineCode)}
        disabled={!plainFormattingBlocked && !availability.canInlineCode}
        type="button"
        aria-label={t("editor.inlineCode")}
        {...getFormattingButtonProps(t("editor.inlineCode"))}
      >
        <IconCode size={TOOLBAR_ICON_SIZE} stroke={TOOLBAR_ICON_STROKE} />
      </button>
      <button
        className="toolbar-btn-iconized toolbar-btn-icon-only"
        onClick={withPlainFormattingGuard(onClearFormat)}
        disabled={!plainFormattingBlocked && !availability.canClearFormat}
        type="button"
        aria-label={t("editor.clearFormat")}
        {...getFormattingButtonProps(t("editor.clearFormat"))}
      >
        <IconEraser size={TOOLBAR_ICON_SIZE} stroke={TOOLBAR_ICON_STROKE} />
      </button>
      <button
        className="toolbar-btn-iconized toolbar-btn-icon-only"
        onClick={withPlainFormattingGuard(onInsertHorizontalRule)}
        disabled={!plainFormattingBlocked && !availability.canBlockTransforms}
        type="button"
        aria-label={t("editor.horizontalRule")}
        {...getFormattingButtonProps(t("editor.horizontalRule"))}
      >
        {isVertical ? (
          <IconSeparatorVertical
            size={TOOLBAR_ICON_SIZE}
            stroke={TOOLBAR_ICON_STROKE}
          />
        ) : (
          <IconSeparatorHorizontal
            size={TOOLBAR_ICON_SIZE}
            stroke={TOOLBAR_ICON_STROKE}
          />
        )}
      </button>
      <div className="toolbar-heading-menu-wrap" ref={headingMenuRef}>
        <button
          className={`toolbar-btn-iconized toolbar-btn-icon-only toolbar-heading-trigger${headingMenuOpen ? " open" : ""}`}
          onClick={withPlainFormattingGuard(() =>
            setHeadingMenuOpen((prev) => !prev),
          )}
          disabled={!plainFormattingBlocked && !availability.canBlockTransforms}
          type="button"
          aria-label={t("editor.heading")}
          aria-haspopup="menu"
          aria-expanded={headingMenuOpen}
          {...getFormattingButtonProps(t("editor.heading"))}
        >
          <IconHeading size={TOOLBAR_ICON_SIZE} stroke={TOOLBAR_ICON_STROKE} />
          <IconChevronDown size={12} stroke={TOOLBAR_ICON_STROKE} />
        </button>
        {headingMenuOpen && (
          <div
            className="toolbar-heading-menu"
            role="menu"
            aria-label={t("editor.headingMenu")}
          >
            {headingItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={`toolbar-heading-menu-item${availability.isHeading === item.level ? " active" : ""}`}
                  type="button"
                  role="menuitem"
                  disabled={plainFormattingBlocked}
                  onClick={withPlainFormattingGuard(() => {
                    onToggleHeading(item.level);
                    setHeadingMenuOpen(false);
                  })}
                >
                  <Icon size={16} stroke={TOOLBAR_ICON_STROKE} />
                  <span>{item.label}</span>
                </button>
              );
            })}
            <button
              className={`toolbar-heading-menu-item${availability.isHeading === false ? " active" : ""}`}
              type="button"
              role="menuitem"
              disabled={plainFormattingBlocked}
              onClick={withPlainFormattingGuard(() => {
                onToggleHeading(0);
                setHeadingMenuOpen(false);
              })}
            >
              <IconHeadingOff size={16} stroke={TOOLBAR_ICON_STROKE} />
              <span>{t("editor.heading.clear")}</span>
            </button>
          </div>
        )}
      </div>
      <button
        className={`toolbar-btn-iconized toolbar-btn-icon-only${availability.isBulletList ? " toggle-active" : ""}`}
        onClick={withPlainFormattingGuard(onToggleBulletList)}
        disabled={!plainFormattingBlocked && !availability.canBlockTransforms}
        type="button"
        aria-label={t("editor.bulletList")}
        {...getFormattingButtonProps(t("editor.bulletList"))}
      >
        <IconList size={TOOLBAR_ICON_SIZE} stroke={TOOLBAR_ICON_STROKE} />
      </button>
      <button
        className={`toolbar-btn-iconized toolbar-btn-icon-only${availability.isOrderedList ? " toggle-active" : ""}`}
        onClick={withPlainFormattingGuard(onToggleOrderedList)}
        disabled={!plainFormattingBlocked && !availability.canBlockTransforms}
        type="button"
        aria-label={t("editor.orderedList")}
        {...getFormattingButtonProps(t("editor.orderedList"))}
      >
        <IconListNumbers
          size={TOOLBAR_ICON_SIZE}
          stroke={TOOLBAR_ICON_STROKE}
        />
      </button>
      <button
        className={`toolbar-btn-iconized toolbar-btn-icon-only${availability.isChecklist ? " toggle-active" : ""}`}
        onClick={withPlainFormattingGuard(onToggleChecklist)}
        disabled={!plainFormattingBlocked && !availability.canBlockTransforms}
        type="button"
        aria-label={t("editor.checklist")}
        {...getFormattingButtonProps(t("editor.checklist"))}
      >
        <IconSquareCheck
          size={TOOLBAR_ICON_SIZE}
          stroke={TOOLBAR_ICON_STROKE}
        />
      </button>
      <button
        className={`toolbar-btn-iconized toolbar-btn-icon-only${availability.isBlockquote ? " toggle-active" : ""}`}
        onClick={withPlainFormattingGuard(onToggleBlockquote)}
        disabled={!plainFormattingBlocked && !availability.canBlockTransforms}
        type="button"
        aria-label={t("editor.blockquote")}
        {...getFormattingButtonProps(t("editor.blockquote"))}
      >
        <IconBlockquote size={TOOLBAR_ICON_SIZE} stroke={TOOLBAR_ICON_STROKE} />
      </button>
      <button
        className={`toolbar-btn-iconized toolbar-btn-icon-only${availability.isCodeBlock ? " toggle-active" : ""}`}
        onClick={withPlainFormattingGuard(onToggleCodeBlock)}
        disabled={!plainFormattingBlocked && !availability.canBlockTransforms}
        type="button"
        aria-label={t("editor.codeBlock")}
        {...getFormattingButtonProps(t("editor.codeBlock"))}
      >
        <IconCodeDots size={TOOLBAR_ICON_SIZE} stroke={TOOLBAR_ICON_STROKE} />
      </button>
      <span className="toolbar-sep">|</span>
      <button
        className="toolbar-btn-iconized toolbar-btn-icon-only"
        onClick={withPlainFormattingGuard(onSetOrUnsetLink)}
        type="button"
        aria-label={t("editor.link")}
        {...getFormattingButtonProps(t("editor.link"))}
      >
        <IconLink size={TOOLBAR_ICON_SIZE} stroke={TOOLBAR_ICON_STROKE} />
      </button>
      <button
        className="toolbar-btn-iconized toolbar-btn-icon-only"
        onClick={withPlainFormattingGuard(onInsertImage)}
        type="button"
        aria-label={t("editor.image")}
        {...getFormattingButtonProps(t("editor.image"))}
      >
        <IconPhoto size={TOOLBAR_ICON_SIZE} stroke={TOOLBAR_ICON_STROKE} />
      </button>
      <button
        className="toolbar-btn-iconized toolbar-btn-icon-only"
        onClick={withPlainFormattingGuard(onInsertRubyBouten)}
        type="button"
        disabled={!plainFormattingBlocked && !availability.canInsertRuby}
        aria-label={t("editor.insertRuby")}
        {...getFormattingButtonProps(t("editor.insertRuby"))}
      >
        <IconDiamond size={TOOLBAR_ICON_SIZE} stroke={TOOLBAR_ICON_STROKE} />
      </button>
      <button
        className="toolbar-btn-iconized toolbar-btn-icon-only"
        onClick={withPlainFormattingGuard(onToggleTcy)}
        disabled={!plainFormattingBlocked && !availability.canToggleTcy}
        type="button"
        aria-label={t("editor.tcy")}
        {...getFormattingButtonProps(t("editor.tcy"))}
      >
        <IconNumber123 size={TOOLBAR_ICON_SIZE} stroke={TOOLBAR_ICON_STROKE} />
      </button>
      <button
        className={`toolbar-btn-iconized toolbar-btn-icon-only${rubyVisible ? " toggle-active" : ""}`}
        onClick={onToggleRubyVisible}
        type="button"
        data-tooltip={t("editor.rubyView")}
        aria-label={t("editor.rubyView")}
        aria-pressed={rubyVisible}
      >
        {rubyVisible ? (
          <IconEye size={TOOLBAR_ICON_SIZE} stroke={TOOLBAR_ICON_STROKE} />
        ) : (
          <IconEyeOff size={TOOLBAR_ICON_SIZE} stroke={TOOLBAR_ICON_STROKE} />
        )}
      </button>
      <button
        className="toolbar-btn-iconized toolbar-btn-icon-only"
        onClick={onToggleWritingMode}
        type="button"
        data-tooltip={isVertical ? t("editor.switchHorizontal") : t("editor.switchVertical")}
        aria-label={isVertical ? t("editor.switchHorizontal") : t("editor.switchVertical")}
      >
        {isVertical ? (
          <IconSwitchVertical
            size={TOOLBAR_ICON_SIZE}
            stroke={TOOLBAR_ICON_STROKE}
          />
        ) : (
          <IconSwitchHorizontal
            size={TOOLBAR_ICON_SIZE}
            stroke={TOOLBAR_ICON_STROKE}
          />
        )}
      </button>
      <button
        className={`toolbar-btn-iconized toolbar-btn-icon-only${paragraphPlainModeActive ? " toggle-active" : ""}`}
        onPointerDown={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggleParagraphPlainMode}
        disabled={
          fullPlainEditActive ||
          (!availability.canParagraphPlain && !paragraphPlainModeActive)
        }
        type="button"
        data-tooltip={t("editor.paragraphPlain")}
        aria-label={t("editor.paragraphPlain")}
        aria-pressed={paragraphPlainModeActive}
      >
        <IconPilcrow size={TOOLBAR_ICON_SIZE} stroke={TOOLBAR_ICON_STROKE} />
      </button>
      <button
        className={`toolbar-btn-iconized toolbar-btn-icon-only${fullPlainEditActive ? " toggle-active" : ""}`}
        onClick={onToggleFullPlainEdit}
        disabled={paragraphPlainModeActive}
        type="button"
        data-tooltip={t("editor.sourceMode")}
        aria-label={t("editor.sourceMode")}
        aria-pressed={fullPlainEditActive}
      >
        <IconFileCode size={TOOLBAR_ICON_SIZE} stroke={TOOLBAR_ICON_STROKE} />
      </button>
      <button
        className={`toolbar-btn-iconized toolbar-btn-icon-only${displaySettingsOpen ? " toggle-active" : ""}`}
        onClick={onOpenDisplaySettings}
        type="button"
        data-tooltip={t("editor.viewSettings")}
        aria-label={t("editor.viewSettings")}
        aria-pressed={displaySettingsOpen}
      >
        <IconSettings size={TOOLBAR_ICON_SIZE} stroke={TOOLBAR_ICON_STROKE} />
      </button>
      <span className="toolbar-sep">|</span>
      <button
        className="toolbar-btn-iconized toolbar-btn-icon-only"
        onClick={onLoad}
        type="button"
        data-tooltip={t("common.load")}
        aria-label={t("common.load")}
      >
        <IconFolderOpen size={TOOLBAR_ICON_SIZE} stroke={TOOLBAR_ICON_STROKE} />
      </button>
      <button
        className="toolbar-btn-iconized toolbar-btn-icon-only"
        onClick={onSave}
        type="button"
        data-tooltip={t("common.save")}
        aria-label={t("common.save")}
      >
        <IconDeviceFloppy
          size={TOOLBAR_ICON_SIZE}
          stroke={TOOLBAR_ICON_STROKE}
        />
      </button>
    </section>
  );
}
