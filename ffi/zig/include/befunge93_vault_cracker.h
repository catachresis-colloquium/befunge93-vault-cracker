/* SPDX-License-Identifier: MPL-2.0 */
/* Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk> */

#ifndef BEFUNGE93_VAULT_CRACKER_H
#define BEFUNGE93_VAULT_CRACKER_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct befunge93_vault_cracker_handle befunge93_vault_cracker_handle_t;

typedef enum befunge93_vault_cracker_result {
  BEFUNGE93_VAULT_CRACKER_OK = 0,
  BEFUNGE93_VAULT_CRACKER_ERROR = 1,
  BEFUNGE93_VAULT_CRACKER_INVALID_PARAM = 2,
  BEFUNGE93_VAULT_CRACKER_OUT_OF_MEMORY = 3,
  BEFUNGE93_VAULT_CRACKER_NULL_POINTER = 4
} befunge93_vault_cracker_result_t;

befunge93_vault_cracker_handle_t *befunge93_vault_cracker_init(void);
void befunge93_vault_cracker_free(befunge93_vault_cracker_handle_t *handle);
uint32_t befunge93_vault_cracker_is_initialized(const befunge93_vault_cracker_handle_t *handle);

befunge93_vault_cracker_result_t befunge93_vault_cracker_torus_step(
    uint32_t row,
    uint32_t col,
    uint32_t dir,
    uint32_t *out_row,
    uint32_t *out_col);

befunge93_vault_cracker_result_t befunge93_vault_cracker_eval_grid(
    befunge93_vault_cracker_handle_t *handle,
    const uint8_t *grid_ptr,
    uint32_t grid_len,
    uint32_t max_steps,
    uint8_t *out_buf,
    uint32_t out_cap,
    uint32_t *out_len,
    uint32_t *out_halted);

befunge93_vault_cracker_result_t befunge93_vault_cracker_run_vault(
    befunge93_vault_cracker_handle_t *handle,
    uint8_t *out_buf,
    uint32_t out_cap,
    uint32_t *out_len);

const char *befunge93_vault_cracker_last_error(void);
const char *befunge93_vault_cracker_version(void);
const char *befunge93_vault_cracker_build_info(void);

#ifdef __cplusplus
}
#endif

#endif /* BEFUNGE93_VAULT_CRACKER_H */
