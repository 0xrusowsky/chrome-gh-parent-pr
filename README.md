# Chrome GitHub PR Stack

A small Chrome extension that shows stacked pull requests in a **Stack** section above GitHub's **Reviewers** sidebar section.

Each PR in the chain appears on its own line, from the root PR to the current PR. The extension follows target branches until it reaches `main`, `master`, or a branch without an open parent PR.

## Install

1. Clone or download this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the repository directory.
5. Reload a GitHub pull request page.

No build step or personal access token is required.
