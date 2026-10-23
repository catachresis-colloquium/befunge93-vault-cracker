;; SPDX-License-Identifier: MPL-2.0
;; SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
;;
;; guix.scm — befunge93-vault-cracker as a Guix source package.
;; Canon: hyperpolymath/standards 3-practice/provisioning/PROVISIONING-STANDARD.adoc.
(use-modules (guix packages) (guix gexp)
             (guix build-system copy)
             (gnu packages)
             ((guix licenses) #:prefix license:))

(define %source-dir
  (let ((d (dirname (current-filename))))
    (if (string=? (basename d) "build") (dirname d) d)))

(define (spec->input spec)
  (call-with-values (lambda () (specification->package+output spec))
    (lambda (pkg out) (if (string=? out "out") pkg (list pkg out)))))

(define %ignored
  '(".git" "dist" "target" ".eval" "node_modules" "_build" "deps" "zig-out" ".zig-cache"))

(package
  (name "befunge93-vault-cracker")
  (version "0.2.0")
  (source (local-file %source-dir "befunge93-vault-cracker-checkout"
                      #:recursive? #t
                      #:select? (lambda (file stat)
                                  (not (member (basename file) %ignored)))))
  (build-system copy-build-system)
  (arguments (list #:install-plan #~'(("." "share/befunge93-vault-cracker/"))))
  (native-inputs (map spec->input (list "git" "bash" "coreutils" "nss-certs" "just" "mise"
                                        "shellcheck" "chez-scheme" "gmp" "gcc-toolchain" "zig")))
  (home-page "https://github.com/catachresis-colloquium/befunge93-vault-cracker")
  (synopsis "Interactive 2D Befunge-93 torus puzzle in Vue 3 and Bun")
  (description "Interactive esoteric-programming puzzle pairing a pure functional
TEA state machine in Vue 3 Single-File Components on Bun with a verified 10x10
Befunge-93 torus VM, Zig C-ABI FFI, and total Idris2 ABI specifications.")
  (license license:mpl2.0))
