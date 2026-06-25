# GitHub Actions Workflows

These files belong in `.github/workflows/` but could not be pushed there because
the current OAuth token lacks the `workflow` scope.

To activate CI and GitHub Pages deployment, run:

```bash
mkdir -p .github/workflows
cp _workflows/ci.yml .github/workflows/ci.yml
cp _workflows/deploy.yml .github/workflows/deploy.yml
git add .github/
git commit -m "Add GitHub Actions CI and deploy workflows"
git push  # requires a token with the 'workflow' scope
```

## ci.yml

Runs `tsc -b` (type check) and `npm test` (vitest) on every branch push and pull request.

## deploy.yml

On push to `main`: runs tests → builds with `VITE_BASE_PATH=/game-engine/` → deploys to GitHub Pages.
Requires the repo to have GitHub Pages enabled with source set to "GitHub Actions".
