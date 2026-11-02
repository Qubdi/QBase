#!/bin/sh
# The Postgres image is pinned by digest in three places: the image Dockerfile
# (which Dependabot updates) and the service containers of CI and publish. They
# must name the same image, or the tests run on a different database than the
# one that ships. Run from the repository root.
set -eu

files="db/postgres/Dockerfile .github/workflows/ci.yaml .github/workflows/publish.yaml"
pins=$(grep -Eho 'postgres:[0-9a-z.-]+@sha256:[0-9a-f]{64}' $files | sort -u)
count=$(printf '%s\n' "$pins" | grep -c .)

if [ "$count" -ne 1 ]; then
    echo "The Postgres image is pinned to $count different digests:" >&2
    for file in $files; do
        printf '  %s: ' "$file" >&2
        grep -Eho 'postgres:[0-9a-z.-]+@sha256:[0-9a-f]{64}' "$file" | sort -u | tr '\n' ' ' >&2
        echo >&2
    done
    echo "Update them all to the one in db/postgres/Dockerfile." >&2
    exit 1
fi
echo "Postgres is pinned to one image: $pins"
