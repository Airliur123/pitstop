# MinIO and S3-compatible Storage

- **Status:** Accepted
- **Context:** Optional photos need local/prod API parity without selecting production hosting now.
- **Decision:** Use MinIO locally behind an S3-compatible contract.
- **Consequences:** Upload validation, lifecycle, object keys, and presigned URLs need security review.
- **Review conditions:** Review maintained MinIO distribution before Phase 1 and production provider later.
