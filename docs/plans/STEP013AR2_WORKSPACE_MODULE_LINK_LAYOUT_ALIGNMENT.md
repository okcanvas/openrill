# STEP013AR2_WORKSPACE_MODULE_LINK_LAYOUT_ALIGNMENT

## 목적
STEP013AR1 Windows acceptance에서 확인된 `OPENRILL_WORKSPACE_MODULE_LINKS_FAIL reason=scope_missing`를 pnpm workspace link layout 오판으로 확정하고, BrowserRuntime 기능을 바꾸지 않은 채 current-root contamination gate를 실제 Node resolution layout에 맞춘다.

## 기준선
- retained feature: `STEP013A_BROWSER_RUNTIME_LIFECYCLE_AND_POLICY_FOUNDATION`
- corrective release: `STEP013AR2_WORKSPACE_MODULE_LINK_LAYOUT_ALIGNMENT`
- version: `0.13.2-step013ar2`
- schema: 9
- official accepted baseline: STEP012DR4 Windows 180/180

## 코드 확인
기존 verifier는 root `node_modules/@openrill` scope가 반드시 존재한다고 가정했다. pnpm isolated workspace layout에서는 root package가 내부 workspace dependency를 선언하지 않으면 root scope가 없어도 정상이며, 각 importer package의 `node_modules`에서 workspace dependency가 연결된다.

## 구현 범위
- package importer별 선언된 내부 workspace dependency resolution 검증
- root scope present/absent 양쪽 지원
- package-local junction/symlink current-root exact target 검증
- root-scope-absent positive fixture
- outside-root negative fixture
- OR-ISSUE-086 문서·Registry·recurrence gate

## 공개 계약
BrowserRuntime API, Browser policy, Host lifecycle, schema, lock importer graph, STEP013A feature scope는 변경하지 않는다.

## 상태 전이
Runtime 상태 전이는 없다. 검증 상태만 physical root-scope existence에서 logical importer resolution ownership으로 전환한다.

## 실패 및 복구
선언된 내부 dependency가 importer 탐색 경로에서 보이지 않거나 current root 밖 또는 잘못된 package target으로 해석되면 importer와 dependency 이름만 포함한 bounded evidence로 실패한다.

## Acceptance
- workspace lock alignment 26 importers / 64 dependency keys
- retained lock focused 4/4
- module layout focused 3/3
- BrowserRuntime 13/13
- Browser boundaries 8/8
- historical Host fixtures 14/14
- canonical serial suite 258/258, skipped 0
- initial/final package manifest unchanged
- deterministic source/repeat/fresh ZIP

## 반복 방지 기록
OR-ISSUE-086 detail, Registry row, recurrence gate, root-scope-absent fixture, cross-root rejection fixture가 함께 존재해야 한다.

## 패키징 산출물
`openrill-step013ar2-workspace-module-link-layout-alignment-v1.zip`

## 제외
Browser Tool, concrete adapter, migration, persistent profile, Artifact surface, Browser UI는 추가하지 않는다.

## 완료 선언
Windows final marker가 확인되기 전 STEP013AR2는 validation candidate이며 STEP012DR4가 official accepted baseline이다.
