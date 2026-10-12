import { MultiFileDiff } from "@pierre/diffs/react";
import type { FileDiffOptions } from "@pierre/diffs/react";

import { BASE_OPTIONS } from "../review/patch-view";

const OPTIONS: FileDiffOptions<undefined, undefined> = {
  ...BASE_OPTIONS,
  diffStyle: "unified",
  disableFileHeader: true,
  expandUnchanged: true,
};

/** The code a finding quotes against the code it suggests. Import it lazily: it loads the diff highlighter. */
export default function SuggestionDiff(props: {
  file: string;
  existing: string;
  suggestion: string;
}) {
  return (
    <MultiFileDiff<undefined, undefined>
      oldFile={{
        contents: `${props.existing.replace(/\n+$/u, "")}\n`,
        name: props.file,
      }}
      newFile={{
        contents: `${props.suggestion.replace(/\n+$/u, "")}\n`,
        name: props.file,
      }}
      options={OPTIONS}
    />
  );
}
