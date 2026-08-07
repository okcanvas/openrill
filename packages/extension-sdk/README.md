# @openrill/extension-sdk

OpenRill이 소유하는 최소 로컬 Extension 계약이다.

- closed `openrill.extension.json` manifest
- exact Extension API version and bounded Host version compatibility
- declared capability ownership
- closed per-Extension config schema
- existing OpenRill `SecretRef` reuse
- activation context without direct State, Run, Task or Task Flow authority

Discovery, module import, activation order, duplicate-capability rejection, runtime status and deactivation are Host responsibilities. Remote install, marketplace, package scripts and hot reload are intentionally outside STEP022A.
