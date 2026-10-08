/* Browser UI: all remote text is rendered as text, never HTML. */
function mountGuyFightsModBrowser(manager, api, active) {
  const dialog = document.getElementById('modsDialog');
  const browse = document.getElementById('modsBrowse'), installed = document.getElementById('modsInstalled');
  const status = document.getElementById('modsStatus');
  const text = (tag, value) => { const node = document.createElement(tag); node.textContent = value; return node; };
  const button = (label, action, disabled = false) => {
    const node = text('button', label); node.type = 'button'; node.disabled = disabled;
    node.addEventListener('click', async () => {
      node.disabled = true; status.textContent = 'Loading…';
      try { await action(); status.textContent = ''; }
      catch (error) { manager.log(label, error); status.textContent = api.message(error); }
      finally { render(); }
    });
    return node;
  };
  function card(manifest) {
    const node = text('article', ''); node.className = 'menu-card mod-card';
    // Prevent the existing translator from treating author-provided text as UI labels.
    node.setAttribute('data-i18n-ignore', '');
    node.append(text('h3', manifest.name), text('p', 'By ' + manifest.author + ' · v' + manifest.version),
      text('p', manifest.description), text('p', 'Compatibility: ' + manifest.compatibility.minimum + ' – ' + manifest.compatibility.maximum),
      text('p', 'Tags: ' + (manifest.tags.join(', ') || 'None')));
    return node;
  }
  function render() {
    browse.replaceChildren(); installed.replaceChildren();
    document.getElementById('modsPending').textContent = manager.pending ? 'Changes are saved and will apply after this match. Active match data is unchanged.' : 'Mods apply before a match. Later enabled mods take priority. Match settings remain editable.';
    document.getElementById('modsNotice').textContent = manager.notice;
    if (manager.registryState === 'loading') browse.append(text('p', 'Loading…'));
    else if (manager.registryState === 'error') browse.append(text('p', api.message(manager.registryError)));
    else if (!manager.catalog) browse.append(text('p', 'Open Browse or Refresh to fetch the registry.'));
    else if (!manager.catalog.mods.length) browse.append(text('p', 'No published mods yet. Local JSON import is available below.'));
    else for (const entry of manager.catalog.mods) {
      const node = card(entry), previous = manager.installed.get(entry.id);
      const compatible = api.compatibility(entry.compatibility, manager.gameVersion);
      const update = previous && api.compareVersions(entry.version, previous.version) > 0;
      node.append(text('p', !compatible ? 'Incompatible' : update ? 'Update available' : previous ? 'Installed' : 'Not installed'));
      if (!previous || update) node.append(button(update ? 'Update' : 'Install', () => manager.installRemote(entry), !compatible));
      browse.append(node);
    }
    if (!manager.installed.size) installed.append(text('p', 'No installed mods.'));
    for (const manifest of manager.installed.values()) {
      const node = card(manifest), enabled = manager.enabled.includes(manifest.id);
      node.append(text('p', manager.status(manifest)));
      const conflicts = manager.conflicts(manifest);
      if (conflicts.length) node.append(text('p', 'Overlaps with: ' + conflicts.join(', ') + '. Later enabled mods win.'));
      if (enabled) node.append(text('p', 'Enabled order: ' + (manager.enabled.indexOf(manifest.id) + 1)));
      node.append(button(enabled ? 'Disable' : 'Enable', () => manager.setEnabled(manifest.id, !enabled)),
        button('Uninstall', () => manager.uninstall(manifest.id)));
      installed.append(node);
    }
    // Never clear action error text merely because a render occurred.
  }
  document.getElementById('titleMods').addEventListener('click', () => {
    if (active()) return;
    status.textContent = ''; render(); dialog.showModal(); manager.browse();
  });
  document.getElementById('closeMods').addEventListener('click', () => dialog.close());
  document.getElementById('refreshMods').addEventListener('click', () => { status.textContent = ''; manager.browse(); });
  document.getElementById('importLocalMod').addEventListener('change', async event => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try {
      if (file.size > 262144) api.fail('INVALID_MANIFEST', 'Local manifest exceeds size limit');
      manager.install(api.parse(await file.text()), true); status.textContent = 'Installed. Enable it when ready.';
    } catch (error) { manager.log('local import', error); status.textContent = api.message(error); }
    render();
  });
  manager.onChange(render); render();
}
