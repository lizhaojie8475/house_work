# Final review fixes 2

## Status

DONE. All six requested fixes are implemented. No database transaction was added, and the reminder quota write/decrement behavior was not changed.

## Item-by-item changes

1. **Race-safe 200 quota ceiling**
   - Added `clampSubscribeQuota(id, max)` to both `shared/repo.js` and `cloudfunctions/api/test/fake-repo.js`.
   - The CloudBase implementation performs a guarded absolute update with `where({ _id: id, subscribeQuota: command.gt(max) })`; the fake uses the same strict `> max` guard.
   - `member.addSubscribeQuota` now invokes that idempotent clamp after an overshoot instead of applying a second relative increment. Its returned value is bounded with `Math.min(..., MAX_QUOTA)`, so callers never receive a value above 200.
   - Added a concurrent top-up regression: two `+20` calls from 195 must finish at exactly 200 and both responses must be at most 200. The existing sequential 195 + 20 = 200 case still passes.
   - Added a real `await Promise.resolve()` interleaving point between the fake increment's read and write.

2. **Effective Jest UTC pin**
   - Changed the unchanged developer command behind `npm test` to `TZ=UTC jest`.
   - Removed the ineffective Jest `setupFiles` entry and deleted `jest.setup.js`.
   - Added a regression assertion that `new Date().getTimezoneOffset() === 0` and `Intl.DateTimeFormat().resolvedOptions().timeZone === 'UTC'`.

3. **Blank `initialLastDoneKey` cannot reset due dates**
   - `normalizeChoreInput` now checks explicit property presence with `Object.prototype.hasOwnProperty.call(...)`, so `''` and `null` are validated and rejected rather than silently normalized to `null`.
   - The update merge preserves an existing valid initial date while still allowing legacy/no-date chores to omit the field.
   - Added regressions for both `''` and `null`, asserting rejection and unchanged `initialLastDoneKey`/`nextDueAt`.

4. **Deterministic recent done-log order**
   - Added `.orderBy('_id', 'desc')` after `doneAt` in the real `listRecentDoneLogs`.
   - Added the matching secondary sort in the fake and covered equal-millisecond done logs.

5. **Byte-order `_id` comparison in the fake**
   - Replaced `localeCompare` with plain `<`/`>` comparison for descending IDs.
   - Added mixed-case IDs (`a`, `B`, `A`) to prove the fake follows byte order.

6. **Complete router registry assertion**
   - Added an exact sorted-key assertion and verified every value is a function.
   - The current registry contains 18 actions (rather than the 17 stated in the review context), and all 18 are asserted explicitly.

## Commands and evidence

### Before changes

Command:

```text
npm test
```

Result:

```text
Test Suites: 18 passed, 18 total
Tests:       295 passed, 295 total
Snapshots:   0 total
```

### Regression tests before implementation

Command:

```text
npx jest cloudfunctions/api/test/member.test.js cloudfunctions/api/test/chore.test.js cloudfunctions/api/test/fake-repo.test.js cloudfunctions/api/test/router.test.js shared/date.test.js --runInBand
```

Result: 4 suites failed and 1 passed; 5 tests failed for the expected quota race, blank-date reset, mixed-case/tiebreak ordering, and ineffective UTC pin. The router registry assertion already passed because the current registry itself was complete.

### Shared-code synchronization

Command:

```text
npm run sync:shared
```

Output:

```text
synced 4 file(s) -> cloudfunctions/api/lib
synced 4 file(s) -> cloudfunctions/reminder/lib
synced 2 file(s) -> miniprogram/utils/shared
```

### Targeted verification

Command:

```text
npm test -- cloudfunctions/api/test/member.test.js cloudfunctions/api/test/chore.test.js cloudfunctions/api/test/fake-repo.test.js cloudfunctions/api/test/router.test.js shared/date.test.js --runInBand
```

Result:

```text
Test Suites: 5 passed, 5 total
Tests:       121 passed, 121 total
Snapshots:   0 total
```

### Final verification

Command:

```text
npm test
```

Result:

```text
> TZ=UTC jest
Test Suites: 18 passed, 18 total
Tests:       300 passed, 300 total
Snapshots:   0 total
```

Also ran `git diff --check` successfully. IDE diagnostics reported no linter errors in edited source and test files.

## UTC proof

Before the package-script change, the new regression failed with `Expected: 0, Received: -480`, proving Jest was still using Asia/Shanghai. After changing the parent-process environment, the same test passed and the full test command visibly executed as `TZ=UTC jest`; both native `Date` offset and `Intl` zone assertions passed.

## Effect of the fake await point

The added await point exposed no additional race or ordering failure: after the requested fixes, all 300 tests pass with pristine output. No await point was reverted or weakened.
