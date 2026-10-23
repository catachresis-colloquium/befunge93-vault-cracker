-- SPDX-License-Identifier: MPL-2.0
-- Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
--
-- Befunge-93 Vault Cracker ABI Types & ProvenTests Taxonomy Integration
-- Modeled on hyperpolymath/proven-tests-and-benches (ProvenTests.Types & ProvenTests.Taxonomy)

module Abi.Types

import Data.Fin
import Data.List
import Data.List.Elem

%default total

-- =============================================================================
-- BEFUNGE-93 TORUS & TEA DOMAIN TYPES
-- =============================================================================

||| Valid coordinate on the 10x10 vault torus (0 .. 9).
public export
TorusCoord : Type
TorusCoord = Fin 10

||| Cardinal instruction-pointer directions on the 2D playfield.
public export
data Direction = DirRight | DirDown | DirLeft | DirUp

export
Eq Direction where
  DirRight == DirRight = True
  DirDown  == DirDown  = True
  DirLeft  == DirLeft  = True
  DirUp    == DirUp    = True
  _        == _        = False

||| Bounded TEA walk stage index (0 .. 18 across 18 walk steps).
public export
VaultStage : Type
VaultStage = Fin 19

||| C-ABI status codes matching `befunge93_vault_cracker_result_t`.
public export
data FfiResult : Type where
  FfiOk           : FfiResult
  FfiError        : FfiResult
  FfiInvalidParam : FfiResult
  FfiOutOfMemory  : FfiResult
  FfiNullPointer  : FfiResult

public export
ffiResultCode : FfiResult -> Int32
ffiResultCode FfiOk           = 0
ffiResultCode FfiError        = 1
ffiResultCode FfiInvalidParam = 2
ffiResultCode FfiOutOfMemory  = 3
ffiResultCode FfiNullPointer  = 4

-- =============================================================================
-- PROVEN-TESTS-AND-BENCHES TAXONOMY AXES
-- =============================================================================

||| Three-tier provenance classification from `hyperpolymath/proven-tests-and-benches`.
public export
data ProvenStatus : Type where
  ActuallyProven      : ProvenStatus
  ProvisionallyProven : ProvenStatus
  Unproven            : ProvenStatus

export
Show ProvenStatus where
  show ActuallyProven      = "Actually-Proven"
  show ProvisionallyProven = "Provisionally-Proven"
  show Unproven            = "Unproven"

||| All 18 test categories from `TESTING-TAXONOMY.adoc` Part I.
public export
data TestCategory : Type where
  UnitTest              : TestCategory
  PointToPoint          : TestCategory
  EndToEnd              : TestCategory
  BuildTest             : TestCategory
  ExecutionRuntime      : TestCategory
  ReflexiveTest         : TestCategory
  LifecycleTest         : TestCategory
  SmokeTest             : TestCategory
  PropertyBasedTest     : TestCategory
  MutationTest          : TestCategory
  FuzzTest              : TestCategory
  ContractInvariantTest : TestCategory
  RegressionTest        : TestCategory
  ChaosResilienceTest   : TestCategory
  CompatibilityTest     : TestCategory
  ProofRegressionTest   : TestCategory
  TypeSafeTest          : TestCategory
  CouplingDriftTest     : TestCategory

||| All 14 quality aspects from `TESTING-TAXONOMY.adoc` Part II.
public export
data TestAspect : Type where
  Dependability    : TestAspect
  Security         : TestAspect
  Usability        : TestAspect
  Interoperability : TestAspect
  Safety           : TestAspect
  Performance      : TestAspect
  Functionality    : TestAspect
  Versability      : TestAspect
  Accessibility    : TestAspect
  Maintainability  : TestAspect
  Privacy          : TestAspect
  Observability    : TestAspect
  Reproducibility  : TestAspect
  Portability      : TestAspect

public export
allTestCategories : List TestCategory
allTestCategories = [
  UnitTest, PointToPoint, EndToEnd, BuildTest, ExecutionRuntime,
  ReflexiveTest, LifecycleTest, SmokeTest, PropertyBasedTest,
  MutationTest, FuzzTest, ContractInvariantTest, RegressionTest,
  ChaosResilienceTest, CompatibilityTest, ProofRegressionTest,
  TypeSafeTest, CouplingDriftTest
]

public export
allTestAspects : List TestAspect
allTestAspects = [
  Dependability, Security, Usability, Interoperability, Safety,
  Performance, Functionality, Versability, Accessibility,
  Maintainability, Privacy, Observability, Reproducibility, Portability
]
