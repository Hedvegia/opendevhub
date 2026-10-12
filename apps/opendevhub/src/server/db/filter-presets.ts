import type { ForgejoPresetFilters } from "../../shared/forgejo";
import type { JiraPresetFilters } from "../../shared/jira";
import { ConflictError, NotFoundError } from "../errors";
import type { Db } from "./database";

/** A named list view and the filters it stands for. */
export interface FilterPreset<F> {
  id: number;
  name: string;
  filters: F;
}

type PresetTable = "forgejo_filter_presets" | "jira_filter_presets";

interface RawPreset {
  id: number;
  name: string;
  filters: string;
}

const toPreset = <F>(r: RawPreset): FilterPreset<F> => ({
  filters: JSON.parse(r.filters) as F,
  id: r.id,
  name: r.name,
});

const isUniqueViolation = (error: unknown) =>
  error instanceof Error && /UNIQUE constraint failed/u.test(error.message);

/** Named list views in one table; names are unique regardless of case. */
export class FilterPresetStore<F> {
  private readonly db: Db;
  private readonly table: PresetTable;
  private readonly now: () => number;
  constructor(db: Db, table: PresetTable, now: () => number = Date.now) {
    this.db = db;
    this.table = table;
    this.now = now;
  }

  /** Every preset, by name. */
  list(): FilterPreset<F>[] {
    return (
      this.db
        .prepare(`SELECT * FROM ${this.table} ORDER BY name`)
        .all() as unknown as RawPreset[]
    ).map((r) => toPreset<F>(r));
  }

  /** Throws ConflictError when another preset has the name. */
  create(name: string, filters: F): FilterPreset<F> {
    const at = this.now();
    const row = this.guard(name, () =>
      this.db
        .prepare(
          `INSERT INTO ${this.table} (name, filters, created_at, updated_at) VALUES (?, ?, ?, ?) RETURNING *`
        )
        .get(name, JSON.stringify(filters), at, at)
    ) as unknown as RawPreset;
    return toPreset<F>(row);
  }

  /** Renames the preset, replaces its filters, or both. Throws NotFoundError or ConflictError. */
  update(id: number, changes: { name?: string; filters?: F }): FilterPreset<F> {
    const current = this.get(id);
    const name = changes.name ?? current.name;
    const filters = changes.filters ?? current.filters;
    const row = this.guard(name, () =>
      this.db
        .prepare(
          `UPDATE ${this.table} SET name = ?, filters = ?, updated_at = ? WHERE id = ? RETURNING *`
        )
        .get(name, JSON.stringify(filters), this.now(), id)
    ) as unknown as RawPreset;
    return toPreset<F>(row);
  }

  /** Throws NotFoundError for an unknown preset. */
  remove(id: number): void {
    const { changes } = this.db
      .prepare(`DELETE FROM ${this.table} WHERE id = ?`)
      .run(id);
    if (!changes) {
      throw new NotFoundError(String(id), "filter preset");
    }
  }

  private get(id: number): FilterPreset<F> {
    const row = this.db
      .prepare(`SELECT * FROM ${this.table} WHERE id = ?`)
      .get(id) as RawPreset | undefined;
    if (!row) {
      throw new NotFoundError(String(id), "filter preset");
    }
    return toPreset<F>(row);
  }

  private guard<T>(name: string, write: () => T): T {
    try {
      return write();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(`A preset named “${name}” already exists`);
      }
      throw error;
    }
  }
}

/** Named pull request inbox views. */
export class ForgejoPresetStore extends FilterPresetStore<ForgejoPresetFilters> {
  constructor(db: Db, now?: () => number) {
    super(db, "forgejo_filter_presets", now);
  }
}

/** Named Tickets page views. */
export class JiraPresetStore extends FilterPresetStore<JiraPresetFilters> {
  constructor(db: Db, now?: () => number) {
    super(db, "jira_filter_presets", now);
  }
}
