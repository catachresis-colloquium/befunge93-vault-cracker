-- SPDX-License-Identifier: MPL-2.0
-- Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
--
-- Memory Layout & C-ABI Alignment Specification for Befunge-93 Vault Cracker

module Abi.Layout

import Abi.Types
import Data.Vect

%default total

||| Fixed dimensions of the canonical vault playfield (10 rows x 10 columns).
public export
PlayfieldRows : Nat
PlayfieldRows = 10

public export
PlayfieldCols : Nat
PlayfieldCols = 10

||| Canonical passcode length in ASCII bytes ("98261047" = 8 bytes).
public export
PasscodeByteLen : Nat
PasscodeByteLen = 8

||| C-ABI descriptor for an output buffer passed to `befunge93_vault_cracker_run_vault`.
public export
record VaultOutputBufferLayout where
  constructor MkVaultOutputBufferLayout
  capacityBytes : Nat
  sufficientCap : So (capacityBytes >= PasscodeByteLen)

||| Proof witness that our standard 16-byte stack buffer satisfies the 8-byte minimum.
public export
defaultVaultOutputLayout : VaultOutputBufferLayout
defaultVaultOutputLayout = MkVaultOutputBufferLayout 16 Oh
