import type { ForgejoPresetFilters } from "../../../shared/forgejo";
import {
  createForgejoPreset,
  fetchForgejoPresets,
  removeForgejoPreset,
  updateForgejoPreset,
} from "../../api";
import { FilterPresets } from "../../components/filter-presets";
import type { PresetSource } from "../../components/filter-presets";

/** The inbox search parameters a view stands for; two views with the same string list the same pull requests. */
export const presetSearch = (filters: ForgejoPresetFilters): string =>
  new URLSearchParams({
    inbox: filters.inbox,
    state: filters.state,
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.repository ? { repository: filters.repository } : {}),
    ...(filters.org ? { org: filters.org } : {}),
    ...(filters.org && filters.team ? { team: filters.team } : {}),
    ...(filters.authors?.length ? { authors: filters.authors.join(",") } : {}),
  }).toString();

const SOURCE: PresetSource<ForgejoPresetFilters> = {
  create: createForgejoPreset,
  empty:
    "No presets yet. Name the current inbox, state and filters to switch back to them in one click.",
  key: ["forgejo-presets"],
  list: fetchForgejoPresets,
  remove: removeForgejoPreset,
  search: presetSearch,
  update: updateForgejoPreset,
};

/** Named inbox views: switch to one in a click, or save the current one under a name. */
export const ForgejoPresets = (props: {
  current: ForgejoPresetFilters;
  onApply: (filters: ForgejoPresetFilters) => void;
}) => <FilterPresets source={SOURCE} {...props} />;
