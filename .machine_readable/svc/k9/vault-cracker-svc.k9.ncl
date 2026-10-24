K9!
# SPDX-License-Identifier: MPL-2.0
# vault-cracker-svc.k9.ncl — Instantiated K9 self-validating service component
# for befunge93-vault-cracker (K9 Contract Specification v1.0.0).

{
  pedigree = {
    schema_version = "1.0.0",
    component_type = "service:web-game",

    metadata = {
      name = "befunge93-vault-cracker-svc",
      version = "0.2.0",
      description = "Declarative Yard-level service configuration and invariants for the Befunge-93 Vault Cracker Vue 3 + Bun puzzle runtime",
      author = "Jonathan D.A. Jewell <j.d.a.jewell@open.ac.uk>",
    },

    security = {
      leash = 'Yard,
      trust_level = "validated-configuration",
      allow_network = false,
      allow_filesystem_write = false,
      allow_subprocess = false,
      signature_required = false,
    },
  },

  config = {
    service_name = "befunge93-vault-cracker",
    host = "0.0.0.0",
    port | std.number.Nat = 8000,
    health_path = "/health",
    ui_framework = "vue-3.5",
    runtime = "bun",
    playfield_rows | std.number.PosNat = 10,
    playfield_cols | std.number.PosNat = 10,
    walk_stages | std.number.PosNat = 18,
  },

  validation = {
    valid_port = config.port >= 1024 && config.port <= 65535,
    square_torus = config.playfield_rows == 10 && config.playfield_cols == 10,
    non_empty_stages = config.walk_stages == 18,
  },
}
