# Security and execution boundaries

The dashboard binds to loopback and is not an authenticated multi-user service. Do not expose it through a public proxy without authentication and transport security. Reports and snapshots can include repository paths and findings.

The built-in survey reads the configured workspace. It does not execute repository code, run package scripts, edit source files, or call an AI provider. Checks are bounded and heuristic; a clean report is not a security certification.

OpenClaw workflows can execute tools, edit files, create commits and pull requests, and incur provider costs according to your configuration. Read the bundled YAML and agent instructions before installation. Separate sessions and workspaces are not operating-system sandboxes.

The server checks mutation origins and host headers, constrains static files, and limits bodies. These measures do not protect against a malicious local process with the same filesystem permissions. Keep credentials in the runtime, never browser settings or this repository.

Report vulnerabilities privately to the repository owner using GitHub private vulnerability reporting if enabled. Do not put credentials or private source in public issues. This project does not inherit upstream maintainers' response commitments.
