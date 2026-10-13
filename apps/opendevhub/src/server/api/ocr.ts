import { Hono } from "hono";

import type { DashboardDeps } from "../dashboard-api";
import { UnavailableError } from "../errors";
import { ocrLogLines } from "../ocr/logs";
import { json } from "./helpers";
import { bodies, validateJson } from "./validation";

/** Open Code Review: the default provider and limits, each project's override, testing, importing, installing. */
export const createOcrRoutes = (deps: DashboardDeps) => {
  const requireOcr = () => {
    if (!deps.ocr) {
      throw new UnavailableError("Open Code Review is not available");
    }
    return deps.ocr;
  };
  return new Hono()
    .use("/api/ocr/*", async (c, next) => {
      c.header("Cache-Control", "no-store");
      await next();
    })
    .get("/api/ocr/settings", (c) =>
      json(c, () => requireOcr().settings.view())
    )
    .put("/api/ocr/settings", validateJson(bodies.ocrSettings), (c) =>
      json(c, () => requireOcr().settings.save(c.req.valid("json")))
    )
    .post("/api/ocr/settings/test", validateJson(bodies.ocrTest), (c) =>
      json(c, () => requireOcr().service.test(c.req.valid("json")))
    )
    .post("/api/ocr/settings/import", (c) =>
      json(c, () => requireOcr().settings.importHost())
    )
    .post("/api/ocr/install", validateJson(bodies.ocrInstall), (c) =>
      json(c, () => {
        const b = c.req.valid("json");
        return requireOcr().service.install(b.projectId, b.directory);
      })
    )
    .get("/api/ocr/runs/:id/logs", (c) => {
      requireOcr();
      return c.json({ lines: ocrLogLines(c.req.param("id")) });
    })
    .get("/api/projects/:id/ocr", (c) =>
      json(c, (id) => requireOcr().settings.projectView(id))
    )
    .put("/api/projects/:id/ocr", validateJson(bodies.ocrProject), (c) =>
      json(c, (id) =>
        requireOcr().settings.saveProject(id, c.req.valid("json"))
      )
    );
};
