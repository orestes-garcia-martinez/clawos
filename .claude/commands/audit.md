Your goal is to update any vulnerable dependencies.

Do the following:

1. Run `npm audit` to find vulnerable installed packages in this project.
2. Run `npm audit fix` to apply updates.
3. Run tests (e.g., `npm run test` and `npm run test:integration`) to verify the updates didn't break anything.
4. If vulnerabilities remain that `npm audit fix` couldn't handle, suggest manual updates or check for breaking changes.
