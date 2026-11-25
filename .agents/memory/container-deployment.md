---
name: Container deployment decisions
description: Packaging and access decisions for standalone Docker installations.
---

Use separate application and PostgreSQL containers for the standard Docker installation, retaining database state in a named volume.

**Why:** Separating services avoids managing PostgreSQL permissions and two process lifecycles inside the application container.

**How to apply:** Preserve this default when extending container deployment; an existing external PostgreSQL database can also serve the app.

Resolve schema tooling and its dependencies from the same project-local installation rather than installing the CLI globally.

**Why:** The globally installed schema tool failed dependency discovery during container startup despite the dependencies being available to the app.

**How to apply:** Keep schema tooling tied to the lockfile and verify startup against an empty database, not just image compilation.

Keep standalone access private by default unless authentication is explicitly hardened.

**Why:** The existing product deliberately permits passwordless administrator login, so publishing the container port on all interfaces would expose administrative access.

**How to apply:** Retain loopback port binding and clearly warn operators before enabling remote access.
