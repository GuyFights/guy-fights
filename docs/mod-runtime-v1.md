# Mod Runtime v1 — Beta 0.2.4

The shipped build is `src/guy_fights_0.2.4.html`, a standalone HTML file with the runtime and schemas embedded. `src/guy_fights_0.2.2.html` and `src/guy_fights_0.2.3.html` are preserved byte-for-byte. No public registry entries were added. This feature is implemented in the game repository, not in the registry repository.

## Protocol provenance

The public contract is [GuyFights/guy-fights-mods](https://github.com/GuyFights/guy-fights-mods), commit `4a0ee09b88b34e044251fef0c685cb7216ea5819`: README, `docs/mod-api-v1.md` including integration notes, manifest/catalog schemas, offline validator, and both example manifests. The two files under `src/mod-runtime/*.schema.json` are verbatim snapshots of those authoritative schemas. There is no second format, schema download at startup, or remote code dependency. The runtime implements the exact validation keywords used by these snapshots; unsupported schema keywords fail closed. When updating snapshots, review keyword support and adapters, then run the tests.

The original source SHA-256 is `83d13e6e5c167c4c0b1abe882ad17a690d844e2afd5da61eec2347b064539810`. The new build identifies itself as Beta 0.2.4 but retains the 0.2.2 game data and mechanics except the explicit Mod Runtime integration. Compatibility is checked against `0.2.4`; manifests accepting `0.2.2` through `0.2.x` work. An exact maximum of `0.2.2` is correctly incompatible with this newer build.

## Base definitions and application

Startup first restores the existing user roster/settings, then captures clean per-Guy baselines. Editable baseline branches are cloned and frozen. Built-in defaults remain separate from legacy user edits and from registry runtime overlays. Each rebuild starts from fresh cloned baseline definitions and fresh terrain/default dictionaries. Enabled IDs are persisted in order; newly enabled mods append and later mods win on overlapping fields. The UI displays overlap warnings and each enabled position. Disable/re-enable moves a mod to the end explicitly; ordinary rebuilds do not reorder it or accumulate effects.

The adapter applies only literal whitelisted fields through explicit switch statements. No manifest-provided property path, expression, executable hook, script URL, or JavaScript is accepted. All enabled mods are checked before committing. If an enabled list restored from storage fails, the entire candidate is discarded, errors are reported per mod, and clean base definitions run. Disable/uninstall the failing mod to recover the remaining list. A bad mod cannot block game startup. Normal installation rejects unsupported operations before saving.

Installing saves a validated manifest in disabled state. Updates preserve existing enabled state but are checked against the whole enabled list before persistence. Changing enabled state/uninstalling during a match saves the requested state and shows that it applies next match. It never modifies active definitions. Returning to the menu or starting the next match after resetting performs the pending rebuild.

Legacy `.pak` library autosave exports clean user/base definitions, not the registry overlays; this avoids baking changes back into the base on reload. Editing a Guy affected by an enabled registry mod is rejected until that mod is disabled. Restoring built-in Guys in Test Mode likewise requires disabling registry mods first. Custom package import, translations, controls, skins, and other settings otherwise retain their existing behavior. Registry JSON never enters the existing custom-script/package execution path.

## IDs and implemented mappings

Guy selectors are explicit constants mapped to current internal `CHARACTERS` keys, never localized strings or array indices:

| External ID | Internal key |
| --- | --- |
| drunk-guy | Drunk Guy |
| angry-guy | Angry Guy |
| tired-guy | Tired Guy |
| business-guy | Business Guy |
| badass-cool-guy | Badass Cool Guy |
| chef-guy | Chef Guy |
| woman-guy | Woman Guy |
| tennis-guy | Tennis Guy |
| boxing-guy | Boxing Guy |
| magician-guy | Magician Guy |
| gravity-guy | Gravity Guy |
| dealer-guy | Dealer Guy |

Test Guys and scripted replacements of a built-in Guy are rejected. An ID must also exist in the restored baseline. Terrain IDs are the exact public type IDs: `river`, `lava`, `mud`, `ice`, `poison`, `healing`, `boost`, `wind`, `shield`, `wall`. Type overrides apply to already placed zones of that type. They do not create zones or select numeric placed-instance IDs.

| Category | Supported fields | Actual mapping / restrictions |
| --- | --- | --- |
| Guys | hp | `hp`, public 1–1000000 limit |
| Guys | baseDamage | `defaultAttack.damage` only where a default attack exists; never adds one to Gravity/Dealer |
| Guys | movementSpeedMin, movementSpeedMax | `speed.min`, `speed.max`; effective pair checked after each mod, including partial overrides |
| Guys | projectileInterval, projectileSpeed, projectileSize, projectileCount, projectileShotSpacing | Explicit `projectile.interval/speed/size/count/shotSpacing` and matching attack config; currently Drunk, Angry, Tired, Business only |
| Guys | sleepDuration | Tired Guy `projectile.sleepSeconds` and attack config only |
| Zones | strength | Read-only per-type overlay on placed zone strength; current engine supports 0.1–5, narrower than public schema |
| Zones | color | Safe `#RRGGBB` overlay; no URLs or arbitrary CSS |
| Zones | opacity | Explicit runtime fill alpha, 0–1; no layout change |
| Zones | blocksProjectiles | Explicit runtime boolean used by projectile shield collision; defaults to true for Shield and false elsewhere |
| Projectiles | speed, size, damage | New explicit stable ID `drunk-bottle`, mapped to Drunk Guy's primary bottle config. Speed uses launch config; size supports 1–240 px; damage is a primary-bottle impact default only |
| Match defaults | roundDuration | `timerSettings.duration`; fractional values retained end to end; changing it never forces the timer on |

`drunk-bottle` is a game-owned ID published here under the existing protocol's projectile slug field; it adds no new manifest shape. It represents the existing primary bottle, not a runtime projectile instance. Unknown projectile IDs are rejected. A Guy `projectileSpeed` override takes precedence over `drunk-bottle.speed` regardless of enabled order, as required by the contract. Other overlapping fields follow normal enabled order. Projectile damage does not rewrite contact damage; explicit player damage overrides and existing Sudden Death rules still take priority.

## Unsupported mappings and mismatches

Schema validity alone does not promise engine support. Reject the entire manifest atomically if it uses an unsupported operation; never silently skip or clamp a field.

- Guy `width`/`height`: editor metadata exists, but this build uses a shared battle frame. Merely editing `size` has no documented gameplay effect, so these fields are unsupported.
- Guy healing fields: no supported non-Test built-in self-healing Guy exists. Special projectile fields on boomerang/machete/Dealer/Magician/Boxing/etc. are intentionally unsupported where generic meanings would alter specialized behavior.
- Terrain `duration`, `radius`, `movementMultiplier`: rectangular percentage-based zones have no corresponding generic fields. Existing effect durations and movement behavior remain type-coded. The public strength ceiling is 100, but the current engine supports only 0.1–5; out-of-engine-range values are rejected even though the schema accepts them.
- Projectile `lifetime`, `bounceCount`, `color`: no safe generic primary-bottle equivalent. The public size ceiling is 500, but the mapped bottle's safe engine limit is 240.
- Match `scoreLimit` and `friendlyFire`: no settings with those meanings exist. They are not silently simulated by reusing team counts or changing target selection.

The supplied real Drunk Guy manifest is supported and tested locally. The registry's supplied match example includes `scoreLimit` and `friendlyFire`, so it is deliberately rejected with an unsupported-operation status. A local test manifest containing only `changes.matchSettings.roundDuration` demonstrates the supported operation. The registry files/catalog remain unchanged. Publishing any example is a separate registry decision.

## Settings and storage

`guyFights.mods.v1` stores a bounded JSON record of installed manifests and ordered enabled IDs (maximum 100 installed mods, 4 MiB total). `guyFights.mods.playerSettings.v1` stores the player's explicit round-duration choice or null to follow defaults. Existing game autosave remains intact. The dedicated mod keys persist independently of the game's general autosave toggle. Storage denial/quota failure rejects installation/state changes with a concise status, while normal base gameplay remains available.

Player settings always overlay mod defaults. A Default button clears the explicit round-duration choice and uses the current mod default. Disabling a mod rebuilds defaults without discarding explicit player choices. Existing saved durations different from 60 migrate as explicit choices; old saves cannot distinguish an explicit choice of 60 from the built-in default. The dedicated null marker prevents autosaved mod defaults from turning into player overrides on future loads.

Stored manifests and enabled IDs are untrusted and revalidated on each startup. Malformed/duplicate local records fall back to the base game without silently overwriting the damaged record. Valid but unsupported/incompatible installed manifests remain visible with a status and can be disabled/uninstalled. Developer logs include category/ID/field rejection details; normal UI uses concise statuses without raw traces.

## Network and browser

Browse resolves `/mods/index.json` against the current page origin and fetches it only when requested; there is no startup dependency on GitHub. Installed mods remain usable offline. Registry and manifests must conform to the pinned schemas, compatibility, and exact shared metadata including ordered tags. Duplicate catalog IDs/JSON keys are rejected.

GitHub remains the source of truth. Production registry JSON is mirrored to the Neocities site because hosting CSP blocks direct GitHub registry fetches. Copy the repository `index.json` to `/mods/index.json` and each `mods/<slug>/mod.json` to `/mods/<slug>/mod.json`, preserving matching metadata. Publish manifests before the catalog so entries do not point to missing files. No automatic mirroring or deployment is included in this hotfix.

Manifest URLs must resolve to the current HTTPS page origin and match `/mods/<slug>/mod.json`. Catalog paths such as `mods/drunk-guy-overdrive/mod.json` resolve from the origin root, not from `/mods/index.json` (which would duplicate `/mods/`). Root-relative paths and absolute same-origin HTTPS URLs are also accepted. Slugs follow the public ID syntax and 64-character limit; prototype-sensitive IDs are rejected. HTTP and file pages cannot browse remotely; installed and local imported mods remain usable. Credentials, query strings, fragments, traversal, percent/backslash tricks, script extensions, and other origins are rejected. Requests omit credentials, disallow redirects, have a 10-second timeout, and enforce streaming byte limits (1 MiB catalog, 256 KiB manifest). JSON parsing rejects duplicate and prototype-sensitive keys, nesting deeper than 16, and all nonfinite numbers including overflow. Remote names/descriptions/tags are rendered with `textContent`. No runtime strings are evaluated or loaded as scripts. The game retains `connect-src 'self'`; no remote domain is added to CSP.

The main-menu MODS dialog includes Browse/Installed sections, metadata, install/update detection, toggle, uninstall, conflict warnings, loading/offline/invalid/incompatible/application-error statuses, and an optional local JSON file import. Installation does not enable the mod. New Mod UI text is currently English; existing translation behavior and canonical IDs are preserved.

## Build and validation

```sh
python -m pip install -r requirements-dev.txt
python scripts/build_mod_runtime.py
python scripts/check_mod_runtime.py
node --test tests/mod-runtime.test.cjs
python -m playwright install chromium
python tests/browser_smoke.py
```

The builder embeds the reviewed runtime sources and verbatim schema snapshots into a new single HTML file using checked integration anchors. No source download occurs during build. The checker verifies that the original 0.2.2 matches Git, that the generated output reproduces exactly, that JSON/schemas/fixtures validate, and that all runtime and assembled game script blocks parse.

Node tests cover protocol validation, operation capabilities, limits, IDs, compatibility, duplicates, metadata agreement, enabled order, nonstacking rebuilds, persistence/corruption, active-match deferral, atomic fallback, network errors, updates, and storage failure. Chromium tests use the actual assembled game with a private mocked remote catalog: UI install/toggle/reload, editable defaults, terrain overlays, moving fighters, active-match deferral, registry errors, updates/mismatch rejection, and uninstall/base recovery. They never add examples to the public catalog. These checks exercise the new integrations, not every pre-existing special attack, controller, or translation combination.
