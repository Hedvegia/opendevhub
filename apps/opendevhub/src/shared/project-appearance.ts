export const PROJECT_COLORS = [
  "slate",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
] as const;

export type ProjectColor = (typeof PROJECT_COLORS)[number];

export const PROJECT_SHORT_NAME = /^[a-zA-Z]{2,3}$/u;

export interface ProjectAppearance {
  shortName?: string;
  color?: ProjectColor;
}

export const isProjectColor = (value: unknown): value is ProjectColor =>
  PROJECT_COLORS.some((color) => color === value);

export const readProjectAppearance = (
  entry: Record<string, unknown>
): ProjectAppearance => ({
  ...(typeof entry.shortName === "string" &&
  PROJECT_SHORT_NAME.test(entry.shortName)
    ? { shortName: entry.shortName.toUpperCase() }
    : {}),
  ...(isProjectColor(entry.color) ? { color: entry.color } : {}),
});
