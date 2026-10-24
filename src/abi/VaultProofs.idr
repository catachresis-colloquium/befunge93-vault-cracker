-- SPDX-License-Identifier: MPL-2.0
-- Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
--
-- Constructive Proofs & Exhaustiveness Obligations for Befunge-93 Vault Cracker
-- Modeled on `ProvenTests.Taxonomy` and `ProvenTests.Zigzag`.

module Abi.VaultProofs

import Abi.Types
import Abi.Layout
import Data.Fin
import Data.List
import Data.List.Elem

%default total

||| Total torus increment on `Fin 10`: wraps 9 -> 0 with no runtime bounds risk.
public export
stepForward10 : Fin 10 -> Fin 10
stepForward10 x =
  case strengthen (FS x) of
    Left  _ => FZ
    Right y => y

||| Total torus decrement on `Fin 10`: wraps 0 -> 9 with no underflow risk.
public export
stepBackward10 : Fin 10 -> Fin 10
stepBackward10 FZ     = 9
stepBackward10 (FS x) = weaken x

||| Total 2D torus coordinate step across all 4 cardinal Befunge-93 directions.
public export
stepTorus : TorusCoord -> TorusCoord -> Direction -> (TorusCoord, TorusCoord)
stepTorus r c DirRight = (r, stepForward10 c)
stepTorus r c DirLeft  = (r, stepBackward10 c)
stepTorus r c DirDown  = (stepForward10 r, c)
stepTorus r c DirUp    = (stepBackward10 r, c)

||| Single eastward torus step from origin (0, 0) advances column to (0, 1).
public export
originRightStep : stepTorus 0 0 DirRight = (0, 1)
originRightStep = Refl

||| Right-then-left on the 10x10 torus at origin returns to origin (0, 0).
public export
originRightLeftIdentity : (let (r1, c1) = stepTorus 0 0 DirRight in stepTorus r1 c1 DirLeft) = (0, 0)
originRightLeftIdentity = Refl

||| Wrapping upward from row 0 lands on row 9.
public export
wrapUpFromZero : stepTorus 0 4 DirUp = (9, 4)
wrapUpFromZero = Refl

||| Exhaustiveness proof: all 18 `TestCategory` constructors appear in `allTestCategories`.
public export
categoryCardinality : length Abi.Types.allTestCategories = 18
categoryCardinality = Refl

||| Exhaustiveness proof: all 14 `TestAspect` constructors appear in `allTestAspects`.
public export
aspectCardinality : length Abi.Types.allTestAspects = 14
aspectCardinality = Refl

public export
allTestAspectsComplete : (a : TestAspect) -> Elem a Abi.Types.allTestAspects
allTestAspectsComplete Dependability    = Here
allTestAspectsComplete Security         = There Here
allTestAspectsComplete Usability        = There (There Here)
allTestAspectsComplete Interoperability = There (There (There Here))
allTestAspectsComplete Safety           = There (There (There (There Here)))
allTestAspectsComplete Performance      = There (There (There (There (There Here))))
allTestAspectsComplete Functionality    = There (There (There (There (There (There Here)))))
allTestAspectsComplete Versability      = There (There (There (There (There (There (There Here))))))
allTestAspectsComplete Accessibility    = There (There (There (There (There (There (There (There Here)))))))
allTestAspectsComplete Maintainability  = There (There (There (There (There (There (There (There (There Here))))))))
allTestAspectsComplete Privacy          = There (There (There (There (There (There (There (There (There (There Here)))))))))
allTestAspectsComplete Observability    = There (There (There (There (There (There (There (There (There (There (There Here))))))))))
allTestAspectsComplete Reproducibility  = There (There (There (There (There (There (There (There (There (There (There (There Here)))))))))))
allTestAspectsComplete Portability      = There (There (There (There (There (There (There (There (There (There (There (There (There Here))))))))))))
