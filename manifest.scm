;; SPDX-License-Identifier: MPL-2.0
;; SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
;;
;; manifest.scm — Guix development shell for befunge93-vault-cracker.
;; Tools Guix does not yet package natively (bun, idris2) are provisioned via mise
;; inside this shell (`guix shell -m manifest.scm -- mise install`).
(specifications->manifest
 (list "git" "bash" "coreutils" "nss-certs" "just" "mise"
       "shellcheck" "chez-scheme" "gmp" "gcc-toolchain" "zig"))
