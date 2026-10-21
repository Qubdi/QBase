# The database image, pinned by digest. It is built (it adds nothing) so that
# docker-compose.yml can give it a name with a tag: an image used straight from
# `postgres:18-alpine@sha256:...` shows up in `docker images` with tag <none>,
# because Docker drops the tag when a digest is given.
# Dependabot keeps this digest current (see .github/dependabot.yml); the major
# version moves on purpose, together with the volume (README, "Upgrading the
# bundled database").
FROM postgres:18-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873
