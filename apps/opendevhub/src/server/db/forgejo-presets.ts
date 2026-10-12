import type {
  ForgejoFilterPreset,
  ForgejoPresetFilters,
} from "../../shared/forgejo";
import { ConflictError, NotFoundError } from "../errors";
import type { Db } from "./database";

interface RawPreset {
  id: number;
  name: string;
  filters: string;
}

const toPreset = (r: RawPreset): ForgejoFilterPreset => ({
  filters: JSON.parse(r.filters) as ForgejoPresetFilters,
  id: r.id,
  name: r.name,
});

const isUniqueViolation = (error: unknown) =>
  error instanceof Error && /UNIQUE constraint failed/u.test(error.message);

/** Named pull request inbox views; names are unique regardless of case. */
export class ForgejoPresetStore {
  private readonly db: Db;
  private readonly now: () => number;
  constructor(db: Db, now: () => number = Date.now) {
    this.db = db;
    this.now = now;
  }

  /** Every preset, by name. */
  list(): ForgejoFilterPreset[] {
    return (
      this.db
        .prepare("SELECT * FROM forgejo_filter_presets ORDER BY name")
        .all() as unknown as RawPreset[]
    ).map(toPreset);
  }

  /** Throws ConflictError when another preset has the name. */
  create(name: string, filters: ForgejoPresetFilters): ForgejoFilterPreset {
    const at = this.now();
    const row = this.guard(name, () =>
      this.db
        .prepare(
          "INSERT INTO forgejo_filter_presets (name, filters, created_at, updated_at) VALUES (?, ?, ?, ?) RETURNING *"
        )
        .get(name, JSON.stringify(filters), at, at)
    ) as unknown as RawPreset;
    return toPreset(row);
  }

  /** Renames the preset, replaces its filters, or both. Throws NotFoundError or ConflictError. */
  update(
    id: number,
    changes: { name?: string; filters?: ForgejoPresetFilters }
  ): ForgejoFilterPreset {
    const current = this.get(id);
    const name = changes.name ?? current.name;
    const filters = changes.filters ?? current.filters;
    const row = this.guard(name, () =>
      this.db
        .prepare(
          "UPDATE forgejo_filter_presets SET name = ?, filters = ?, updated_at = ? WHERE id = ? RETURNING *"
        )
        .get(name, JSON.stringify(filters), this.now(), id)
    ) as unknown as RawPreset;
    return toPreset(row);
  }

  /** Throws NotFoundError for an unknown preset. */
  remove(id: number): void {
    const { changes } = this.db
      .prepare("DELETE FROM forgejo_filter_presets WHERE id = ?")
      .run(id);
    if (!changes) {
      throw new NotFoundError(String(id), "filter preset");
    }
  }

  private get(id: number): ForgejoFilterPreset {
    const row = this.db
      .prepare("SELECT * FROM forgejo_filter_presets WHERE id = ?")
      .get(id) as RawPreset | undefined;
    if (!row) {
      throw new NotFoundError(String(id), "filter preset");
    }
    return toPreset(row);
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
