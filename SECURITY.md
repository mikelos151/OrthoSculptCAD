# Security Policy

## Supported Versions
| Version | Supported |
| :--- | :--- |
| 0.2.x | :white_check_mark: |
| < 0.2 | :x: |

## Local-First Security Guarantees
OrthoSculpt CAD is engineered as a strictly local-first application:
- It binds exclusively to `127.0.0.1`.
- It does not expose public network endpoints or upload patient mesh/scan data to third-party cloud servers.
- Project files and revisions can be encrypted with local passwords.

## Reporting a Vulnerability
If you discover a security vulnerability or sensitive data leak risk:
1. Please **do not** open a public issue.
2. Report the vulnerability privately via GitHub Security Advisories or contact the maintainer directly at the email listed on their GitHub profile.
3. Please include detailed reproduction steps and affected versions. You will receive an acknowledgment within 48 hours.
