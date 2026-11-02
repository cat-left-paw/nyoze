import type { HeadingInfo } from "../../editor-core/types";

export type VisibleOutlineItem<T extends HeadingInfo = HeadingInfo> = {
  heading: T;
  originalIndex: number;
};

export function resolveVisibleOutlineItems<T extends HeadingInfo>(
  headings: readonly T[],
  foldedHeadingPositions: ReadonlySet<number>,
): VisibleOutlineItem<T>[] {
  const visibleItems: VisibleOutlineItem<T>[] = [];
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
