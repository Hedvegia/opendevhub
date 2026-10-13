import { Badge } from "@opendevhub/ui/badge";
import { Button } from "@opendevhub/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@opendevhub/ui/command";
import { Input } from "@opendevhub/ui/input";
import { Label } from "@opendevhub/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@opendevhub/ui/popover";
import { CheckIcon, ListFilterIcon, UserPlusIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import {
  fetchForgejoOrganizations,
  fetchForgejoTeams,
  fetchForgejoUsers,
} from "../../api";
import { Choice } from "../../components/choice";
import { Chip } from "../../components/page";
import { useForgejoQuery } from "./use-forgejo";

/** Most authors one filter takes, as the server allows. */
const MAX_AUTHORS = 20;
const SEARCH_DELAY_MS = 250;
/** A Forgejo login, so a typed name can be added when the account search doesn't list it. */
const LOGIN = /^[\w.-]{1,40}$/u;

const ALL = "";
/** Keeps a filter from the URL selectable while its list is loading or doesn't include it. */
const withCurrent = (names: string[] | undefined, current: string) =>
  current && !names?.includes(current)
    ? [current, ...(names ?? [])]
    : (names ?? []);

/** The comma-separated `authors` search parameter as distinct logins. */
export const parseAuthors = (value: string | null): string[] => [
  ...new Set((value ?? "").split(",").filter((a) => LOGIN.test(a))),
];

export interface InboxFilters {
  repository: string;
  org: string;
  team: string;
  /** Empty when the inbox only lists your own pull requests. */
  authors: string[];
}

const OrgTeamFilter = ({
  org,
  team,
  onChange,
}: {
  org: string;
  team: string;
  onChange: (org: string, team: string) => void;
}) => {
  const orgs = useForgejoQuery(["orgs"], fetchForgejoOrganizations);
  const teams = useForgejoQuery(
    ["teams", org],
    (signal) => fetchForgejoTeams(org, signal),
    !!org
  );
  return (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor="forgejo-org-filter">Organization</Label>
        <Choice
          id="forgejo-org-filter"
          className="w-full"
          label="Organization filter"
          value={org}
          disabled={orgs.isError && !org}
          onChange={(value) => onChange(value, ALL)}
          options={[
            { label: "All organizations", value: ALL },
            ...withCurrent(orgs.data?.orgs, org).map((name) => ({
              label: name,
              value: name,
            })),
          ]}
        />
      </div>
      {org && (
        <div className="grid gap-1.5">
          <Label htmlFor="forgejo-team-filter">Team</Label>
          <Choice
            id="forgejo-team-filter"
            className="w-full"
            label="Team filter"
            value={team}
            disabled={teams.isError && !team}
            onChange={(value) => onChange(org, value)}
            options={[
              {
                label: teams.isError ? "Teams unavailable" : "All teams",
                value: ALL,
              },
              ...withCurrent(teams.data?.teams, team).map((name) => ({
                label: name,
                value: name,
              })),
            ]}
          />
        </div>
      )}
    </>
  );
};

const AuthorItem = ({
  login,
  name,
  checked,
  disabled,
  onToggle,
}: {
  login: string;
  name?: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) => (
  <CommandItem value={login} disabled={disabled} onSelect={onToggle}>
    <CheckIcon className={checked ? "" : "invisible"} />
    <span className="truncate">{login}</span>
    {name && name !== login && (
      <span className="text-muted-foreground truncate text-xs">{name}</span>
    )}
  </CommandItem>
);

/** Pick any number of authors: from the loaded list, or by searching Forgejo's accounts. */
const AuthorPicker = ({
  authors,
  suggestions,
  onChange,
}: {
  authors: string[];
  suggestions: string[];
  onChange: (authors: string[]) => void;
}) => {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);
  const users = useForgejoQuery(
    ["users", term],
    (signal) => fetchForgejoUsers(term, signal),
    !!term
  );
  const chosen = new Set(authors.map((a) => a.toLowerCase()));
  const full = authors.length >= MAX_AUTHORS;
  const toggle = (login: string) =>
    onChange(
      chosen.has(login.toLowerCase())
        ? authors.filter((a) => a.toLowerCase() !== login.toLowerCase())
        : [...authors, login]
    );
  const typed = search.trim();
  const matches = (term ? (users.data?.users ?? []) : []).filter(
    (u) => !chosen.has(u.login.toLowerCase())
  );
  const seen = term
    ? []
    : suggestions.filter((login) => !chosen.has(login.toLowerCase()));
  const offerTyped =
    LOGIN.test(typed) &&
    !chosen.has(typed.toLowerCase()) &&
    !matches.some((u) => u.login.toLowerCase() === typed.toLowerCase());
  return (
    <Command shouldFilter={false} className="rounded-md border">
      <CommandInput
        aria-label="Search authors"
        placeholder="Search accounts…"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList className="max-h-56">
        {!authors.length && !seen.length && !term && (
          <CommandEmpty>Type to search accounts.</CommandEmpty>
        )}
        {!!authors.length && (
          <CommandGroup heading="Selected">
            {authors.map((login) => (
              <AuthorItem
                key={login}
                login={login}
                checked
                onToggle={() => toggle(login)}
              />
            ))}
          </CommandGroup>
        )}
        {!!seen.length && (
          <CommandGroup heading="Recent authors">
            {seen.map((login) => (
              <AuthorItem
                key={login}
                login={login}
                checked={false}
                disabled={full}
                onToggle={() => toggle(login)}
              />
            ))}
          </CommandGroup>
        )}
        {!!term && (
          <CommandGroup heading="Accounts">
            {users.isFetching && !users.data && (
              <p className="text-muted-foreground px-2 py-1.5 text-sm">
                Searching…
              </p>
            )}
            {users.isError && (
              <p className="text-muted-foreground px-2 py-1.5 text-sm">
                Account search unavailable.
              </p>
            )}
            {matches.map((u) => (
              <AuthorItem
                key={u.login}
                login={u.login}
                name={u.fullName}
                checked={false}
                disabled={full}
                onToggle={() => toggle(u.login)}
              />
            ))}
            {offerTyped && (
              <CommandItem
                value={`add:${typed}`}
                disabled={full}
                onSelect={() => {
                  toggle(typed);
                  setSearch("");
                }}
              >
                <UserPlusIcon /> Add “{typed}”
              </CommandItem>
            )}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
};

/** The filters that don't fit beside the search box, behind one button that counts the active ones. */
export const ForgejoFilters = ({
  filters,
  repoInput,
  onRepoInput,
  showAuthors,
  suggestedAuthors,
  onOrgTeam,
  onAuthors,
  onClear,
}: {
  filters: InboxFilters;
  repoInput: string;
  onRepoInput: (value: string) => void;
  showAuthors: boolean;
  suggestedAuthors: string[];
  onOrgTeam: (org: string, team: string) => void;
  onAuthors: (authors: string[]) => void;
  onClear: () => void;
}) => {
  const active = activeFilters(filters).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <ListFilterIcon /> Filters
          {!!active && (
            <Badge className="ml-0.5 h-5 min-w-5 rounded-full px-1.5 tabular-nums">
              {active}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-80 gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="forgejo-repository-filter">Repository</Label>
          <Input
            id="forgejo-repository-filter"
            placeholder="owner/name"
            value={repoInput}
            onChange={(e) => onRepoInput(e.target.value)}
          />
        </div>
        <OrgTeamFilter
          org={filters.org}
          team={filters.team}
          onChange={onOrgTeam}
        />
        {showAuthors && (
          <div className="grid gap-1.5">
            <Label>Opened by</Label>
            <AuthorPicker
              authors={filters.authors}
              suggestions={suggestedAuthors}
              onChange={onAuthors}
            />
            <p className="text-muted-foreground text-xs">
              Shows pull requests by any of the selected authors.
            </p>
          </div>
        )}
        {!!active && (
          <Button
            variant="ghost"
            size="sm"
            className="justify-self-start"
            onClick={onClear}
          >
            Clear filters
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
};

export interface ActiveFilter {
  key: keyof InboxFilters;
  label: string;
  value: string;
}

const activeFilters = (filters: InboxFilters): ActiveFilter[] => [
  ...(filters.repository
    ? [
        {
          key: "repository" as const,
          label: "Repository",
          value: filters.repository,
        },
      ]
    : []),
  ...(filters.org
    ? [{ key: "org" as const, label: "Organization", value: filters.org }]
    : []),
  ...(filters.team
    ? [{ key: "team" as const, label: "Team", value: filters.team }]
    : []),
  ...filters.authors.map((value) => ({
    key: "authors" as const,
    label: "By",
    value,
  })),
];

/** One removable chip per active filter, so they stay visible while the popover is closed. */
export const ActiveFilters = ({
  filters,
  onRemove,
  onClear,
}: {
  filters: InboxFilters;
  onRemove: (filter: ActiveFilter) => void;
  onClear: () => void;
}) => {
  const active = activeFilters(filters);
  if (!active.length) {
    return null;
  }
  return (
    <div className="-mt-2 flex flex-wrap items-center gap-1.5">
      {active.map((filter) => (
        <Chip
          key={`${filter.key}:${filter.value}`}
          className="gap-1 py-0.5 pr-0.5"
        >
          <span>
            {filter.label}:{" "}
            <span className="text-foreground">{filter.value}</span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove ${filter.label.toLowerCase()} filter ${filter.value}`}
            className="hover:bg-background hover:text-foreground size-4 rounded-sm p-0"
            onClick={() => onRemove(filter)}
          >
            <XIcon className="size-3" />
          </Button>
        </Chip>
      ))}
      {active.length > 1 && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-6 px-2 text-xs"
          onClick={onClear}
        >
          Clear all
        </Button>
      )}
    </div>
  );
};
