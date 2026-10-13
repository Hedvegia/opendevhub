# @opendevhub/ui

Shared React components based on shadcn/ui, with the OpenDevHub theme and component styling.

Import components by subpath and load the stylesheet once in the application:

```tsx
import { Button } from "@opendevhub/ui/button";

import "@opendevhub/ui/styles.css";
```

The package exports TypeScript source for workspace consumers. The consuming app needs a bundler that handles TSX and Tailwind CSS v4. Use `components.json` from this directory when adding shadcn components. Keep imports inside the package relative so consumers do not need the package's `@/` alias.
