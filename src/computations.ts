/** A pure adapter from one item handle to Holding's batch input. */
export function singleItem({ item }: { item: string }): string[] {
  return [item];
}
