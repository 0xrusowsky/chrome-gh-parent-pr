# Chrome GitHub Parent PR

A small Chrome extension that shows the parent pull request for stacked GitHub PRs.

When a PR targets a branch other than `main` or `master`, the extension looks for an open PR from that target branch and adds a **Parent PR #…** button beside GitHub's **Code** button.

## Install

1. Clone or download this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the repository directory.
5. Reload a GitHub pull request page.

No build step or personal access token is required.
