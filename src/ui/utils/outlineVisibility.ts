import type { HeadingInfo } from "../../editor-core/types";

export type VisibleOutlineItem = {
  heading: HeadingInfo;
  originalIndex: number;
};

export function resolveVisibleOutlineItems(
  headings: readonly HeadingInfo[],
  foldedHeadingPositions: ReadonlySet<number>,
): VisibleOutlineItem[] {
  const visibleItems: VisibleOutlineItem[] = [];
  const foldedAncestorLevels: number[] = [];

  headings.forEach((heading, originalIndex) => {
    while (
      foldedAncestorLevels.length > 0 &&
      foldedAncestorLevels[foldedAncestorLevels.length - 1] >= heading.level
    ) {
      foldedAncestorLevels.pop();
    }

    if (foldedAncestorLevels.length === 0) {
      visibleItems.push({ heading, originalIndex });
      if (foldedHeadingPositions.has(heading.pos)) {
        foldedAncestorLevels.push(heading.level);
      }
    }
  });

  return visibleItems;
}
