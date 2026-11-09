#!/bin/sh
# The Postgres image is pinned by digest in four places: docker-compose.yml
# (which Dependabot updates), the service containers of CI and publish and the
# load-test compose file. They must name the same image, or the tests run on a
# different database than the one that ships. Run from the repository root.
set -eu

files="docker-compose.yml .github/workflows/ci.yaml .github/workflows/publish.yaml server/load/docker-compose.yml"
pins=$(grep -Eho 'postgres:[0-9a-z.-]+@sha256:[0-9a-f]{64}' $files | sort -u)
count=$(printf '%s\n' "$pins" | grep -c .)

if [ "$count" -ne 1 ]; then
    echo "The Postgres image is pinned to $count different digests:" >&2
    for file in $files; do
        printf '  %s: ' "$file" >&2
        grep -Eho 'postgres:[0-9a-z.-]+@sha256:[0-9a-f]{64}' "$file" | sort -u | tr '\n' ' ' >&2
        echo >&2
    done
    echo "Update them all to the one in docker-compose.yml." >&2
    exit 1
fi
echo "Postgres is pinned to one image: $pins"
