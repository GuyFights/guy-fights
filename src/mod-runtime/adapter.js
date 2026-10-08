/* Explicit Beta 0.2.2 mappings. No selectors or paths are taken from manifests. */
function createGuyFightsModAdapter(game, api) {
  const GUY_NAMES = Object.freeze({
    'drunk-guy': 'Drunk Guy', 'angry-guy': 'Angry Guy', 'tired-guy': 'Tired Guy',
    'business-guy': 'Business Guy', 'badass-cool-guy': 'Badass Cool Guy', 'chef-guy': 'Chef Guy',
    'woman-guy': 'Woman Guy', 'tennis-guy': 'Tennis Guy', 'boxing-guy': 'Boxing Guy',
    'magician-guy': 'Magician Guy', 'gravity-guy': 'Gravity Guy', 'dealer-guy': 'Dealer Guy'
  });
  const ZONE_IDS = Object.freeze(['river', 'lava', 'mud', 'ice', 'poison', 'healing', 'boost', 'wind', 'shield', 'wall']);
  const PROJECTILE_IDS = Object.freeze({'drunk-bottle': 'drunk-guy'});
  const simpleShooters = new Set(['drunk-guy', 'angry-guy', 'tired-guy', 'business-guy']);
  const jsonCopy = value => JSON.parse(JSON.stringify(value));
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  function clone(character) {
    const result = game.cloneCharacter(character);
    if (character.projectile) result.projectile = jsonCopy(character.projectile);
    if (character.healing) result.healing = jsonCopy(character.healing);
    return result;
  }
  const sources = new Map(), bases = new Map();
  let effectiveZones = Object.fromEntries(ZONE_IDS.map(id => [id, {}]));
  let effectiveDefaults = Object.freeze({roundDuration: 60});
  function remember(name, character) {
    if (!Object.values(GUY_NAMES).includes(name)) return;
    sources.set(name, character);
    const base = clone(character);
    for (const key of ['defaultAttack', 'size', 'speed', 'projectile', 'healing', 'behaviors']) freeze(base[key]);
    bases.set(name, Object.freeze(base));
  }
  for (const name of Object.values(GUY_NAMES)) if (game.characters[name]) remember(name, game.characters[name]);
  const unsupported = detail => api.fail('UNSUPPORTED', detail);
  function fresh() {
    return {
      guys: Object.fromEntries(Object.entries(GUY_NAMES).filter(([, name]) => bases.has(name)).map(([id, name]) => [id, clone(bases.get(name))])),
      zones: Object.fromEntries(ZONE_IDS.map(id => [id, {}])),
      matchSettings: {roundDuration: 60}, changedGuys: new Set()
    };
  }
  function getGuy(data, id) {
    if (!Object.hasOwn(GUY_NAMES, id) || !Object.hasOwn(data.guys, id)) unsupported('Unknown Guy ID: ' + id);
    const c = data.guys[id];
    if (c.test || c.modded || Object.values(c.behaviors || {}).some(behavior => behavior?.kind === 'module') || Object.keys(c.hooks || {}).length) unsupported('Registry mods only target un-scripted built-in Guys: ' + id);
    return c;
  }
  function attackConfig(c) { return c.behaviors?.attack?.config; }
  function projectileStat(data, id, c, field, value, guyOverride = false) {
    if (!simpleShooters.has(id) || !c.projectile) unsupported('Unsupported projectile stat on ' + id);
    const p = c.projectile, config = attackConfig(c);
    switch (field) {
      case 'interval': p.interval = value; if (Object.hasOwn(p, 'initialCooldown')) p.initialCooldown = value; if (config) { config.interval = value; if (Object.hasOwn(config, 'initialCooldown')) config.initialCooldown = value; } break;
      case 'speed':
        if (guyOverride) p.registryGuySpeed = true;
        if (guyOverride || !p.registryGuySpeed) { p.speed = value; if (config) config.speed = value; }
        break;
      case 'size': p.size = value; if (config) config.size = value; break;
      case 'count': p.count = value; if (config) config.count = value; break;
      case 'shotSpacing': p.shotSpacing = value; if (config) config.shotSpacing = value; break;
      case 'sleepSeconds': if (id !== 'tired-guy') unsupported('sleepDuration requires Tired Guy'); p.sleepSeconds = value; if (config) config.sleepSeconds = value; break;
      default: unsupported('Unsupported projectile field');
    }
    data.changedGuys.add(id);
  }
  function applyGuy(data, operation) {
    const id = operation.id, c = getGuy(data, id);
    for (const [field, value] of Object.entries(operation.set)) {
      switch (field) {
        case 'hp': c.hp = value; break;
        case 'baseDamage': if (!c.defaultAttack) unsupported('This Guy has no default attack: ' + id); c.defaultAttack.damage = value; break;
        case 'movementSpeedMin': c.speed.min = value; break;
        case 'movementSpeedMax': c.speed.max = value; break;
        case 'projectileInterval': projectileStat(data, id, c, 'interval', value); break;
        case 'projectileSpeed': projectileStat(data, id, c, 'speed', value, true); break;
        case 'projectileSize': projectileStat(data, id, c, 'size', value); break;
        case 'projectileCount': projectileStat(data, id, c, 'count', value); break;
        case 'projectileShotSpacing': projectileStat(data, id, c, 'shotSpacing', value); break;
        case 'sleepDuration': projectileStat(data, id, c, 'sleepSeconds', value); break;
        case 'healingAmount': case 'healingInterval': unsupported('No supported built-in self-healing Guy (Test Guys are excluded)'); break;
        case 'width': case 'height': unsupported('This build uses shared battle dimensions; width/height are unsupported'); break;
        default: unsupported('Unsupported Guy field: ' + field);
      }
    }
    if (c.speed.min > c.speed.max) unsupported('Effective minimum speed exceeds maximum for ' + id);
    data.changedGuys.add(id);
  }
  function applyProjectile(data, operation) {
    if (!Object.hasOwn(PROJECTILE_IDS, operation.id)) unsupported('Unknown projectile ID: ' + operation.id);
    const id = PROJECTILE_IDS[operation.id], c = getGuy(data, id);
    for (const [field, value] of Object.entries(operation.set)) {
      switch (field) {
        case 'speed': projectileStat(data, id, c, 'speed', value); break;
        case 'size': if (value > 240) unsupported('Bottle size exceeds its supported 240 px limit'); projectileStat(data, id, c, 'size', value); break;
        case 'damage': c.projectile.registryDamage = value; break;
        default: unsupported('Unsupported bottle field: ' + field);
      }
    }
    data.changedGuys.add(id);
  }
  function applyZone(data, operation) {
    if (!ZONE_IDS.includes(operation.id) || !Object.hasOwn(game.terrainTypes, operation.id)) unsupported('Unknown terrain ID: ' + operation.id);
    const zone = data.zones[operation.id];
    for (const [field, value] of Object.entries(operation.set)) {
      switch (field) {
        case 'strength': if (value < 0.1 || value > 5) unsupported('Terrain strength supports 0.1–5 in this build'); zone.strength = value; break;
        case 'color': zone.color = value; break;
        case 'opacity': zone.opacity = value; break;
        case 'blocksProjectiles': zone.blocksProjectiles = value; break;
        default: unsupported('Unsupported terrain field: ' + field);
      }
    }
  }
  function apply(data, manifest) {
    // Explicit category dispatch; only the validated set fields above can be assigned.
    for (const operation of manifest.changes.projectiles?.modify || []) applyProjectile(data, operation);
    for (const operation of manifest.changes.guys?.modify || []) applyGuy(data, operation);
    for (const operation of manifest.changes.zones?.modify || []) applyZone(data, operation);
    for (const [field, value] of Object.entries(manifest.changes.matchSettings || {})) {
      switch (field) {
        case 'roundDuration': data.matchSettings.roundDuration = value; break;
        default: unsupported('No safe match-setting equivalent: ' + field);
      }
    }
  }
  function runtimeZones(zones) {
    return zones.map(zone => {
      const override = effectiveZones[zone.type] || {};
      // Preserve editor layout; changes are per terrain type, not numeric instance IDs.
      return {...zone, strength: override.strength ?? zone.strength, color: override.color ?? zone.color,
        opacity: override.opacity ?? (zone.type === 'wall' ? 1 : 0.75),
        blocksProjectiles: override.blocksProjectiles ?? (zone.type === 'shield')};
    });
  }
  function commit(data) {
    if (game.active()) api.fail('APPLICATION', 'Cannot commit during a match');
    for (const [id, name] of Object.entries(GUY_NAMES)) if (sources.has(name)) game.characters[name] = data.changedGuys.has(id) ? data.guys[id] : sources.get(name);
    effectiveZones = data.zones; effectiveDefaults = Object.freeze({...data.matchSettings});
    game.applyDefaults(effectiveDefaults);
    game.refresh();
  }
  return {fresh, apply, commit, active: game.active, remember, runtimeZones,
    defaults: () => effectiveDefaults, baseSource: name => sources.get(name), GUY_NAMES, ZONE_IDS, PROJECTILE_IDS};
}
if (typeof module !== 'undefined' && module.exports) module.exports = createGuyFightsModAdapter;
