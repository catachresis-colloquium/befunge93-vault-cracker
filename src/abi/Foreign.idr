-- SPDX-License-Identifier: MPL-2.0
-- Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
--
-- Foreign Function Interface Declarations matching `ffi/zig/src/main.zig`
-- and `ffi/zig/include/befunge93_vault_cracker.h`.

module Abi.Foreign

import Abi.Types
import System.FFI

%default total

public export
VaultHandle : Type
VaultHandle = AnyPtr

%foreign "C:befunge93_vault_cracker_init,libbefunge93_vault_cracker"
prim__init : PrimIO VaultHandle

%foreign "C:befunge93_vault_cracker_free,libbefunge93_vault_cracker"
prim__free : VaultHandle -> PrimIO ()

%foreign "C:befunge93_vault_cracker_is_initialized,libbefunge93_vault_cracker"
prim__isInitialized : VaultHandle -> PrimIO Bits32

%foreign "C:befunge93_vault_cracker_torus_step,libbefunge93_vault_cracker"
prim__torusStep : Bits32 -> Bits32 -> Bits32 -> AnyPtr -> AnyPtr -> PrimIO Int32

%foreign "C:befunge93_vault_cracker_eval_grid,libbefunge93_vault_cracker"
prim__evalGrid : VaultHandle -> AnyPtr -> Bits32 -> Bits32 -> AnyPtr -> Bits32 -> AnyPtr -> AnyPtr -> PrimIO Int32

%foreign "C:befunge93_vault_cracker_run_vault,libbefunge93_vault_cracker"
prim__runVault : VaultHandle -> AnyPtr -> Bits32 -> AnyPtr -> PrimIO Int32

%foreign "C:befunge93_vault_cracker_version,libbefunge93_vault_cracker"
prim__version : PrimIO String

export
initVault : HasIO io => io VaultHandle
initVault = primIO prim__init

export
freeVault : HasIO io => VaultHandle -> io ()
freeVault h = primIO (prim__free h)

export
isVaultInitialized : HasIO io => VaultHandle -> io Bool
isVaultInitialized h = do
  flag <- primIO (prim__isInitialized h)
  pure (flag == 1)

export
vaultVersion : HasIO io => io String
vaultVersion = primIO prim__version
