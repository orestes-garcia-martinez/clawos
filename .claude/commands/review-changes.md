Your goal is to review all uncommitted changes in this project.

Do the following:

1. Run `git diff` to see all unstaged changes.
2. Run `git diff --cached` to see all staged changes.
3. For each changed file, analyze:
   - **Purpose**: What is this change trying to accomplish?
   - **Correctness**: Are there any bugs, logic errors, or edge cases not handled?
   - **Security**: Are there any security vulnerabilities introduced (e.g., injection, exposed secrets, auth issues)?
   - **Performance**: Are there any performance concerns or inefficiencies?
   - **Code Quality**: Does the code follow project conventions? Is it readable and maintainable?
   - **Tests**: Are there adequate tests for the changes? Should new tests be added?

4. Provide a summary with:
   - ✅ **Approved changes**: Changes that look good
   - ⚠️ **Suggestions**: Improvements that could be made but aren't blocking
   - ❌ **Issues**: Problems that should be fixed before committing

5. If there are no uncommitted changes, report that the working directory is clean.
