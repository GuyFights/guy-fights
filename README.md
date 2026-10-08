# Guy Fights

Single-file browser game. The original Beta 0.2.2 is preserved at `src/guy_fights_0.2.2.html`. The new standalone Beta 0.2.3 build at `src/guy_fights_0.2.3.html` adds Mod Runtime v1 and a main-menu MODS browser.

The public JSON protocol and online catalog live in [GuyFights/guy-fights-mods](https://github.com/GuyFights/guy-fights-mods). Mods are declarative data; no downloaded JavaScript or executable hooks are accepted by this runtime. Installed mods work offline and begin disabled. Normal game settings remain editable.

See [Mod Runtime documentation](docs/mod-runtime-v1.md) for supported mappings, known API/game mismatches, storage/network rules, build commands, and testing. Unsupported fields are rejected rather than ignored. The registry's Drunk Guy example is supported; its full match-default example still requires settings the current game does not have. Local JSON import can be used for development without publishing catalog entries.

The shipped game needs no package install or external scripts. For development, change `src/mod-runtime` files and run `python scripts/build_mod_runtime.py` to regenerate 0.2.3. Run the checks and tests documented above before committing.
