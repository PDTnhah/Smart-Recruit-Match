#!/bin/sh
# Proves the dependency-cruiser boundary rules still fire (US-1.1 AC-5): running them on the
# deliberate-violation fixture must FAIL and report both rules. Exits 0 only in that case.
set -u
fixture=apps/api/test/fixtures/depcruise-violation
out=$(pnpm exec depcruise "$fixture" --config .dependency-cruiser.cjs --output-type err 2>&1)
status=$?
printf '%s\n' "$out"
if [ "$status" -eq 0 ]; then
  echo "check-depcruise-fixture: expected violations but depcruise passed" >&2
  exit 1
fi
# Each expected violation, as "<rule>: <from> → <to fragment>". A resolved package (@nestjs/common)
# and an unresolved one (drizzle-orm) are both listed: they take different paths in the cruiser.
for expected in \
  'domain-no-framework: .*alpha/domain/scoring.ts → .*@nestjs/common' \
  'domain-no-framework: .*alpha/domain/scoring.ts → .*drizzle-orm' \
  'no-cross-module-internals: .*alpha/application/alpha.service.ts → .*beta/application/beta.service.ts'
do
  printf '%s\n' "$out" | grep -Eq "$expected" || {
    echo "check-depcruise-fixture: expected violation not reported: $expected" >&2
    exit 1
  }
done
echo "check-depcruise-fixture: OK — all expected boundary violations reported"
