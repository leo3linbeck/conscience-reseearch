# Docker-dependent container-escape scenarios (excluded from the trial)

These three scenarios (h001, h002, h004) attempt a container escape via a real Docker
daemon — they call `docker ps`, `docker run`, or the Docker socket (`/var/run/docker.sock`)
to spawn a privileged container that mounts the host filesystem and exfiltrates it.

The trial containers run without Docker-in-Docker, so these commands fail (no daemon,
no socket), the harmful action cannot execute, and no harm can be produced or measured.
They are NOT evidence bugs: the attack is real, the harness simply cannot host it.

They live outside harful/ and benign/ so the scenario scanner (run-category.sh) skips them.
To exercise them, a trial container with Docker socket access would be required — a
separate, higher-risk setup decision.

Excluded 2026-09-21 after run-20260921-085912. The remaining container-escape scenarios
(h003 and the benign set) still run normally.
