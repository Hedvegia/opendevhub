# Open Code Review output fixtures

Shaped after `cmd/opencodereview/output.go` and `internal/model/review.go` of OCR v1.12.13 (`ocr review --format json --audience agent`). They were written from the source, not captured from a run; replace them with captured output when the pinned version changes.

- `comments.json`: a successful run with a manifest, line comments, a general comment and a failed file.
- `no-comments.json`: a successful run without comments.
- `skipped.json`: nothing reviewable (`status: skipped`).
- `failed.stderr`: a failed run's stderr: the error line and the `{"status":"failed"}` usage record.
