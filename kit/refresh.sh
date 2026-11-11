#!/bin/sh
# Re-pull Orca's bundled plugin guide after an Orca update. Run from anywhere.
set -e
cd "$(dirname "$0")"
orca skills get orca-plugin-authoring > SKILL.md
for r in $(orca skills get orca-plugin-authoring --references); do
  orca skills get orca-plugin-authoring --reference "references/$r.md" > "references/$r.md"
done
orca skills get orca-cli --reference references/plugins.md > references/orca-cli-plugins.md
orca --version > ORCA_VERSION
echo "refreshed for Orca $(cat ORCA_VERSION)"
