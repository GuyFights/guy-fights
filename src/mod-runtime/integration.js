// These variables exist inside the game closure; no game data is exposed by the UI.
let registryManager = null, registryAdapter = null;
let registryPlayerDuration = null;
const registryPlayerKey = 'guyFights.mods.playerSettings.v1';
function registryZones() { return registryAdapter ? registryAdapter.runtimeZones(terrainZones) : terrainZones; }
function registryBaseCharacter(name, current) { return registryAdapter?.baseSource(name) || current; }
function registryBasePackage(name) {
  const current = CHARACTERS[name], base = registryBaseCharacter(name, current);
  try { CHARACTERS[name] = base; return buildGuyPackage(name); }
  finally { CHARACTERS[name] = current; }
}
function saveRegistryPlayerDuration() {
  try { window.localStorage.setItem(registryPlayerKey, JSON.stringify({roundDuration: registryPlayerDuration})); }
  catch (error) { console.warn('[Mods] Player setting persistence unavailable', error); }
}
function initializeRegistryMods() {
  try {
    let storage = null;
    try { storage = window.localStorage; } catch (_) {}
    try {
      const stored = storage?.getItem(registryPlayerKey);
      if (stored) {
        const settings = GuyFightsModRuntime.parse(stored, 1024);
        if (Object.keys(settings).length !== 1 || !Object.hasOwn(settings, 'roundDuration') || settings.roundDuration !== null && (!Number.isFinite(settings.roundDuration) || settings.roundDuration < 1 || settings.roundDuration > 86400)) throw new Error('Invalid stored player duration');
        registryPlayerDuration = settings.roundDuration;
      } else if (timerSettings.duration !== 60) registryPlayerDuration = timerSettings.duration;
    } catch (error) { console.warn('[Mods] Ignored invalid player setting', error); }
    // Null is meaningful: autosaved mod defaults are not explicit player choices.
    saveRegistryPlayerDuration();
    registryAdapter = createGuyFightsModAdapter({
      characters: CHARACTERS, terrainTypes: TERRAIN_TYPES, cloneCharacter: cloneGuy, active: () => battleActive,
      applyDefaults(defaults) {
        timerSettings.duration = registryPlayerDuration ?? defaults.roundDuration;
        timerDuration.value = String(timerSettings.duration);
        document.getElementById('defaultTimer').textContent = 'Default (' + defaults.roundDuration + ' seconds)';
        updateTimerSettings();
      },
      refresh() {
        state.forEach(s => { const c = CHARACTERS[s.characterName]; if (!c) return;
          s.speed = (c.speed?.min ?? 217.5) + Math.random() * ((c.speed?.max ?? 285) - (c.speed?.min ?? 217.5));
          s.attackRule = c.attackRule ?? 'legacy';
        });
        terrainPaintKey = ''; refreshModRoster(); refreshSpeeds(); drawTerrainPreview(); drawScene();
      }
    }, GuyFightsModRuntime);
    registryManager = new GuyFightsModRuntime.Manager({manifestSchema: MOD_MANIFEST_SCHEMA, catalogSchema: MOD_CATALOG_SCHEMA, adapter: registryAdapter, storage, gameVersion: GAME_VERSION});
    registryManager.load(); registryManager.rebuild();
    mountGuyFightsModBrowser(registryManager, GuyFightsModRuntime, () => battleActive);
    timerDuration.step = 'any';
    for (const event of ['input', 'change']) timerDuration.addEventListener(event, () => {
      if (battleActive || !Number.isFinite(Number(timerDuration.value)) || Number(timerDuration.value) !== timerSettings.duration) return;
      registryPlayerDuration = timerSettings.duration; saveRegistryPlayerDuration();
    });
    document.getElementById('defaultTimer').addEventListener('click', () => {
      if (battleActive) return;
      registryPlayerDuration = null; saveRegistryPlayerDuration(); registryManager.rebuild();
    });
    // Development access accepts JSON only and uses the same installation validation.
    window.guyFightsMods = Object.freeze({
      importJSON: text => registryManager.install(GuyFightsModRuntime.parse(text), true),
      enable: id => registryManager.setEnabled(id, true), disable: id => registryManager.setEnabled(id, false),
      uninstall: id => registryManager.uninstall(id), refreshRegistry: () => registryManager.browse(),
      snapshot: () => JSON.parse(JSON.stringify({installed: [...registryManager.installed.values()], enabled: registryManager.enabled, pending: registryManager.pending, errors: [...registryManager.errors.keys()], registryState: registryManager.registryState,
        defaults: registryAdapter.defaults(), guys: Object.fromEntries(Object.entries(registryAdapter.GUY_NAMES).map(([id, name]) => [id, {hp: CHARACTERS[name]?.hp, damage: CHARACTERS[name]?.defaultAttack?.damage, projectileSpeed: CHARACTERS[name]?.projectile?.speed, projectileSize: CHARACTERS[name]?.projectile?.size, projectileInterval: CHARACTERS[name]?.projectile?.interval}])), zones: registryZones()}))
    });
  } catch (error) {
    console.warn('[Mods] Initialization failed; base game remains available', error);
    try { registryAdapter?.commit(registryAdapter.fresh()); } catch (_) {}
    document.getElementById('modsNotice').textContent = 'Mod Manager unavailable. The base game is still available.';
    document.getElementById('titleMods').addEventListener('click', () => document.getElementById('modsDialog').showModal());
    document.getElementById('closeMods').addEventListener('click', () => document.getElementById('modsDialog').close());
  }
}
