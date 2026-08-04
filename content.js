const ROOT_ID = "github-parent-pr";
const DEFAULT_BRANCHES = new Set(["main", "master"]);

// The same Microsoft Codicons used by Supacode.
const PR_ICON_PATHS = {
  open: "M13 10.05V5.5C13 4.12 11.88 3 10.5 3H8.71L9.85 1.85C10.05 1.66 10.05 1.34 9.85 1.15C9.66.95 9.34.95 9.15 1.15L7.15 3.15C6.95 3.34 6.95 3.66 7.15 3.85L9.15 5.85C9.34 6.05 9.66 6.05 9.85 5.85C10.05 5.66 10.05 5.34 9.85 5.15L8.71 4H10.5C11.33 4 12 4.67 12 5.5V10.05C10.86 10.28 10 11.29 10 12.5C10 13.88 11.12 15 12.5 15S15 13.88 15 12.5C15 11.29 14.14 10.28 13 10.05ZM12.5 14C11.67 14 11 13.33 11 12.5S11.67 11 12.5 11 14 11.67 14 12.5 13.33 14 12.5 14ZM6 3.5C6 2.12 4.88 1 3.5 1S1 2.12 1 3.5C1 4.71 1.86 5.72 3 5.95V10.05C1.86 10.28 1 11.29 1 12.5 1 13.88 2.12 15 3.5 15S6 13.88 6 12.5C6 11.29 5.14 10.28 4 10.05V5.95C5.14 5.72 6 4.71 6 3.5ZM2 3.5C2 2.67 2.67 2 3.5 2S5 2.67 5 3.5 4.33 5 3.5 5 2 4.33 2 3.5ZM5 12.5C5 13.33 4.33 14 3.5 14S2 13.33 2 12.5 2.67 11 3.5 11 5 11.67 5 12.5Z",
  draft: "M6 3.5C6 2.12 4.88 1 3.5 1S1 2.12 1 3.5C1 4.71 1.86 5.72 3 5.95V10.05C1.86 10.28 1 11.29 1 12.5 1 13.88 2.12 15 3.5 15S6 13.88 6 12.5C6 11.29 5.14 10.28 4 10.05V5.95C5.14 5.72 6 4.71 6 3.5ZM5 12.5C5 13.33 4.33 14 3.5 14S2 13.33 2 12.5 2.67 11 3.5 11 5 11.67 5 12.5ZM3.5 5C2.67 5 2 4.33 2 3.5S2.67 2 3.5 2 5 2.67 5 3.5 4.33 5 3.5 5ZM12.5 10C11.12 10 10 11.12 10 12.5S11.12 15 12.5 15 15 13.88 15 12.5 13.88 10 12.5 10Zm0 4C11.67 14 11 13.33 11 12.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5Zm-1-6.5a1 1 0 1 1 2 0 1 1 0 0 1-2 0Zm0-4a1 1 0 1 1 2 0 1 1 0 0 1-2 0Z",
  closed: "M13 10.05V7.5a.5.5 0 0 0-1 0v2.55A2.5 2.5 0 1 0 13 10.05ZM12.5 14a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM6 3.5A2.5 2.5 0 1 0 3 5.95v4.1A2.5 2.5 0 1 0 4 10.05v-4.1A2.5 2.5 0 0 0 6 3.5ZM3.5 14a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm0-9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm7.15-.35 1.15-1.15-1.15-1.15a.5.5 0 0 1 .7-.7l1.15 1.14 1.15-1.14a.5.5 0 0 1 .7.7L13.21 3.5l1.14 1.15a.5.5 0 0 1-.7.7L12.5 4.21l-1.15 1.14a.5.5 0 0 1-.7-.7Z"
};

// Supacode-style status badges layered over the pull request icon.
const PR_STATUS_BADGES = {
  draft: '<circle cx="12" cy="12" r="4"/><path d="M10.25 12h.01m1.74 0h.01m1.74 0h.01"/>',
  closed: '<circle cx="12" cy="12" r="4"/><path d="m10.5 10.5 3 3m0-3-3 3"/>',
  merged: '<circle cx="12" cy="12" r="4"/><path d="m10.1 12 1.2 1.2 2.6-2.6"/>'
};

let navigationKey = "";
let requestVersion = 0;
let cachedContext = null;
let cachedStack = null;

function pullContext() {
  const match = location.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) return null;

  const [, owner, repo, number] = match;

  // GitHub has used both `.base-ref` and plain branch links here. Prefer the
  // semantic class, then locate the first repository branch link in the
  // "wants to merge … into … from …" summary.
  const findSummary = (element) => {
    let current = element;
    for (let depth = 0; current && depth < 10; depth++, current = current.parentElement) {
      const text = current.textContent || "";
      // GitHub renders parts of this sentence in nested <div>s, so
      // textContent may contain "intobranchfrom" without spaces.
      if (text.includes("wants to merge")) {
        return current;
      }
    }
    return null;
  };

  let baseElement = document.querySelector(".base-ref");
  let summaryElement = baseElement && findSummary(baseElement);
  if (!baseElement) {
    const treePrefix = `/${owner}/${repo}/tree/`;
    const candidates = [...document.querySelectorAll(`a[href^="${treePrefix}"]`)];
    for (const candidate of candidates) {
      const summary = findSummary(candidate);
      if (summary) {
        baseElement = candidate;
        summaryElement = summary;
        break;
      }
    }
  }

  if (!baseElement) return null;

  let base;
  const href = baseElement.getAttribute("href") || "";
  const treePrefix = `/${owner}/${repo}/tree/`;
  if (href.startsWith(treePrefix)) {
    base = decodeURIComponent(href.slice(treePrefix.length));
  } else {
    base = baseElement.textContent?.trim();
  }

  if (!base) return null;

  let headElement = document.querySelector(".head-ref");
  if (!headElement && summaryElement) {
    const branchLinks = [...summaryElement.querySelectorAll(`a[href^="${treePrefix}"]`)];
    headElement = branchLinks.find((element) => element !== baseElement) || null;
  }

  let head = headElement?.textContent?.trim();
  const headHref = headElement?.getAttribute("href") || "";
  if (headHref.startsWith(treePrefix)) {
    head = decodeURIComponent(headHref.slice(treePrefix.length));
  }

  return { owner, repo, number: Number(number), base, head, baseElement, summaryElement };
}

function apiHeaders() {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

async function findPullHead(url, { owner, repo }) {
  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) return null;

    const documentCopy = new DOMParser().parseFromString(await response.text(), "text/html");
    const treePrefix = `/${owner}/${repo}/tree/`;
    const branchLinks = [...documentCopy.querySelectorAll(`a[href^="${treePrefix}"]`)];

    // The first branch link in the merge summary is the base and the second
    // is the head. Prefer that pair over unrelated branch links elsewhere on
    // the pull request page.
    for (const candidate of branchLinks) {
      let current = candidate;
      for (let depth = 0; current && depth < 10; depth++, current = current.parentElement) {
        if (!(current.textContent || "").includes("wants to merge")) continue;

        const summaryLinks = [...current.querySelectorAll(`a[href^="${treePrefix}"]`)];
        const headLink = summaryLinks.find((link) => link !== candidate);
        if (headLink) {
          return decodeURIComponent(headLink.getAttribute("href").slice(treePrefix.length));
        }
      }
    }

    const uniqueBranches = [];
    const seen = new Set();
    for (const link of branchLinks) {
      const href = link.getAttribute("href");
      if (seen.has(href)) continue;
      seen.add(href);
      uniqueBranches.push(href);
    }
    return uniqueBranches[1]
      ? decodeURIComponent(uniqueBranches[1].slice(treePrefix.length))
      : null;
  } catch {
    return null;
  }
}

async function findPullHeadFromApi({ owner, repo, number }) {
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}`, {
      headers: apiHeaders()
    });
    if (!response.ok) return null;

    const pull = await response.json();
    return pull.head?.ref || null;
  } catch {
    return null;
  }
}

async function findCheckStatus({ owner, repo, number }, pull) {
  try {
    let sha = pull.sha;
    if (!sha) {
      const pullResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}`, {
        headers: apiHeaders()
      });
      if (!pullResponse.ok) return null;
      const details = await pullResponse.json();
      sha = details.head?.sha;
    }
    if (!sha) return null;

    const [checksResponse, statusResponse] = await Promise.all([
      fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=100`, {
        headers: apiHeaders()
      }),
      fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${sha}/status`, {
        headers: apiHeaders()
      })
    ]);

    const checks = checksResponse.ok ? await checksResponse.json() : { check_runs: [] };
    const combinedStatus = statusResponse.ok ? await statusResponse.json() : {};
    const runs = checks.check_runs || [];
    const failingConclusions = new Set([
      "action_required",
      "cancelled",
      "failure",
      "stale",
      "startup_failure",
      "timed_out"
    ]);

    if (
      runs.some((run) => failingConclusions.has(run.conclusion))
      || ["error", "failure"].includes(combinedStatus.state)
    ) {
      return "failure";
    }

    if (
      runs.some((run) => run.status !== "completed")
      || combinedStatus.state === "pending"
    ) {
      return "pending";
    }

    return runs.length || combinedStatus.state === "success" ? "success" : null;
  } catch {
    return null;
  }
}

async function findWithApi({ owner, repo, number, base }) {
  const endpoint = new URL(`https://api.github.com/repos/${owner}/${repo}/pulls`);
  endpoint.searchParams.set("state", "open");
  endpoint.searchParams.set("head", `${owner}:${base}`);
  endpoint.searchParams.set("per_page", "10");

  const response = await fetch(endpoint, { headers: apiHeaders() });
  if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);

  const pulls = await response.json();
  const parent = pulls.find((pull) => pull.number !== number);
  return parent && {
    number: parent.number,
    title: parent.title,
    url: parent.html_url,
    target: parent.base?.ref,
    head: parent.head?.ref,
    sha: parent.head?.sha,
    state: parent.merged_at ? "merged" : parent.draft ? "draft" : parent.state
  };
}

async function findWithGitHubSearch({ owner, repo, number, base }) {
  const endpoint = new URL(`https://github.com/${owner}/${repo}/pulls`);
  endpoint.searchParams.set("q", `is:pr is:open head:${base}`);

  const response = await fetch(endpoint, { credentials: "include" });
  if (!response.ok) throw new Error(`GitHub search returned ${response.status}`);

  const documentCopy = new DOMParser().parseFromString(await response.text(), "text/html");
  const pullPattern = new RegExp(`^/${owner}/${repo}/pull/(\\d+)$`, "i");

  for (const link of documentCopy.querySelectorAll("a[href]")) {
    const match = link.getAttribute("href")?.match(pullPattern);
    if (!match || Number(match[1]) === number) continue;

    const title = link.textContent?.trim();
    if (!title) continue;

    const url = new URL(link.getAttribute("href"), location.origin).href;
    return {
      number: Number(match[1]),
      title,
      url,
      head: await findPullHead(url, { owner, repo }),
      state: "open"
    };
  }

  return null;
}

async function findParent(context) {
  try {
    const result = await findWithApi(context);
    if (result) return result;
  } catch {
    // Private repositories are not visible to the unauthenticated REST API.
  }

  return findWithGitHubSearch(context);
}

async function findChildren({ owner, repo, number, head }) {
  if (!head) return [];

  try {
    const endpoint = new URL(`https://api.github.com/repos/${owner}/${repo}/pulls`);
    endpoint.searchParams.set("state", "open");
    endpoint.searchParams.set("base", head);
    endpoint.searchParams.set("per_page", "20");

    const response = await fetch(endpoint, { headers: apiHeaders() });
    if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);

    return (await response.json())
      .filter((pull) => pull.number !== number)
      .map((pull) => ({
        number: pull.number,
        title: pull.title,
        url: pull.html_url,
        target: pull.base?.ref,
        head: pull.head?.ref,
        sha: pull.head?.sha,
        state: pull.draft ? "draft" : pull.state
      }));
  } catch {
    // Fall through to GitHub's authenticated HTML search for private repos.
  }

  const endpoint = new URL(`https://github.com/${owner}/${repo}/pulls`);
  endpoint.searchParams.set("q", `is:pr is:open base:${head}`);
  const response = await fetch(endpoint, { credentials: "include" });
  if (!response.ok) return [];

  const documentCopy = new DOMParser().parseFromString(await response.text(), "text/html");
  const pullPattern = new RegExp(`^/${owner}/${repo}/pull/(\\d+)$`, "i");
  const children = [];
  const seen = new Set();
  for (const link of documentCopy.querySelectorAll("a[href]")) {
    const match = link.getAttribute("href")?.match(pullPattern);
    const childNumber = match && Number(match[1]);
    const title = link.textContent?.trim();
    if (!childNumber || childNumber === number || seen.has(childNumber) || !title) continue;
    seen.add(childNumber);
    children.push({
      number: childNumber,
      title,
      url: new URL(link.getAttribute("href"), location.origin).href,
      target: head,
      state: "open"
    });
  }
  return children;
}

async function findDescendants(context, seen, depth = 0) {
  if (!context.head || depth >= 10) return [];

  const descendants = [];
  const children = await findChildren(context);
  for (const child of children) {
    if (seen.has(child.number)) continue;
    if (!child.head) {
      child.head = await findPullHeadFromApi({
        owner: context.owner,
        repo: context.repo,
        number: child.number
      });
    }
    if (!child.head) child.head = await findPullHead(child.url, context);

    seen.add(child.number);
    descendants.push(child);
    descendants.push(...await findDescendants({
      ...child,
      owner: context.owner,
      repo: context.repo
    }, seen, depth + 1));
  }

  return descendants;
}

function pullState(pull) {
  if (pull?.mergedAt || pull?.merged_at || pull?.isMerged || pull?.merged === true) return "merged";
  if (pull?.isDraft || pull?.draft === true) return "draft";

  const state = pull?.state?.toLowerCase();
  return ["open", "closed", "merged", "draft"].includes(state) ? state : null;
}

function currentPullData(context) {
  // Prefer GitHub's visible state pill. Embedded page data is intentionally
  // avoided because GitHub's current React payload is not always valid JSON
  // in the content-script context and the head branch is fetched separately.
  const visibleState = [...document.querySelectorAll(".State, [class*='State--'], [class*='StateLabel'], [data-testid*='state']")]
    .filter((element) => !element.closest(`#${ROOT_ID}`))
    .map((element) => element.textContent?.trim().toLowerCase())
    .find((state) => ["merged", "closed", "draft", "open"].includes(state));

  return {
    title: document.title.split(" · Pull Request")[0].replace(/ by [^·]+$/, "").trim() || `PR #${context.number}`,
    state: visibleState || "open"
  };
}

async function findStack(context) {
  const current = currentPullData(context);
  const apiHead = await findPullHeadFromApi(context);
  if (apiHead) context.head = apiHead;
  else if (!context.head && current.head) context.head = current.head;
  if (!context.head) context.head = await findPullHead(location.href, context);
  const stack = [{
    number: context.number,
    title: current.title || `PR #${context.number}`,
    url: location.href,
    target: context.base,
    state: current.state,
    current: true
  }];

  let cursor = context;
  const seen = new Set([context.number]);
  for (let depth = 0; depth < 10 && !DEFAULT_BRANCHES.has(cursor.base.toLowerCase()); depth++) {
    const parent = await findParent(cursor);
    if (!parent || seen.has(parent.number)) break;

    seen.add(parent.number);
    stack.push(parent);
    if (!parent.target) break;
    cursor = { ...context, number: parent.number, base: parent.target };
  }

  stack.reverse();
  stack.push(...await findDescendants(context, seen));
  return stack;
}

function renderStack(context, stack) {
  document.getElementById(ROOT_ID)?.remove();
  if (!stack.length || !context.baseElement.isConnected) return false;

  // Sidebar variants render either "Reviewers" or "Reviewers – review now".
  // Choose the smallest visible matching element rather than depending on
  // GitHub's frequently changing generated class names.
  const reviewersHeading = [...document.querySelectorAll("h2, h3, h4, span, strong, div")]
    .filter((element) => element.textContent?.trim().startsWith("Reviewers"))
    .filter((element) => element.getClientRects().length > 0)
    .sort((a, b) => a.textContent.trim().length - b.textContent.trim().length)[0];
  if (!reviewersHeading) return false;

  let reviewersSection = reviewersHeading.closest(".discussion-sidebar-item")
    || reviewersHeading.closest("[data-testid*='reviewer']");

  if (!reviewersSection) {
    // Walk outward while we are still inside Reviewers, stopping before the
    // surrounding container that also includes the Assignees section.
    reviewersSection = reviewersHeading;
    while (
      reviewersSection.parentElement
      && !reviewersSection.parentElement.textContent?.includes("Assignees")
    ) {
      reviewersSection = reviewersSection.parentElement;
    }
  }

  // `findStack` builds the chain from the trunk outward. Render that chain in
  // reverse so every parent is always closer to `main` than its child, even
  // when the current PR is in the middle of the stack.
  const orderedStack = [...stack].reverse();

  const section = document.createElement("div");
  section.id = ROOT_ID;
  section.className = "github-pr-stack discussion-sidebar-item sidebar-assignee";

  const list = document.createElement("ol");
  list.className = "github-pr-stack__list";

  for (let index = 0; index < orderedStack.length; index++) {
    const pull = orderedStack[index];
    const state = pull.state || "open";
    const checkStatus = state === "merged" ? "merged" : pull.checkStatus || "success";
    const statusLabel = {
      success: "Checks passed",
      pending: "Checks pending",
      failure: "Checks failing",
      merged: "Merged"
    }[checkStatus] || "Checks unknown";
    const item = document.createElement("li");
    item.className = pull.current ? "github-pr-stack__item is-current" : "github-pr-stack__item";

    const icon = document.createElement("span");
    icon.className = `github-pr-stack__icon is-${checkStatus}`;
    icon.title = statusLabel;
    icon.setAttribute("aria-label", statusLabel);
    const iconPath = checkStatus === "pending"
      ? '<path d="M5 8h.01M8 8h.01M11 8h.01"/>'
      : checkStatus === "failure"
        ? '<path d="m5.25 5.25 5.5 5.5m0-5.5-5.5 5.5"/>'
        : '<path d="m4.5 8 2.25 2.25L11.75 5.5"/>';
    icon.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7"/>${iconPath}</svg>`;

    const details = document.createElement("div");
    details.className = "github-pr-stack__details";

    const link = document.createElement("a");
    link.href = pull.url;
    link.className = "Link--primary github-pr-stack__link";
    link.title = pull.title;
    link.textContent = pull.title;
    if (pull.current) link.setAttribute("aria-current", "page");

    const branch = pull.head || (pull.current ? context.head : null) || orderedStack[index - 1]?.target || "";
    const meta = document.createElement("div");
    meta.className = "github-pr-stack__meta";
    meta.textContent = `#${pull.number}${branch ? ` · ${branch}` : ""}`;

    details.append(link, meta);

    item.append(icon, details);
    list.append(item);
  }

  // The trunk is the base branch that is not itself another PR's head.
  // This keeps `main` as the bottom row even when the current PR is a parent.
  const stackHeads = new Set([
    ...stack.map((pull) => pull.head),
    context.head
  ].filter(Boolean));
  const trunk = stack
    .map((pull) => pull.target)
    .find((target) => target && !stackHeads.has(target)) || stack[0]?.target || context.base;
  if (trunk) {
    const baseItem = document.createElement("li");
    baseItem.className = "github-pr-stack__item github-pr-stack__base";

    const baseIcon = document.createElement("span");
    baseIcon.className = "github-pr-stack__base-icon";
    baseIcon.setAttribute("aria-hidden", "true");

    const baseLabel = document.createElement("span");
    baseLabel.className = "github-pr-stack__base-label";
    baseLabel.textContent = trunk;

    baseItem.append(baseIcon, baseLabel);
    list.append(baseItem);
  }

  section.append(list);
  reviewersSection.before(section);
  return true;
}

async function update() {
  const context = pullContext();
  const key = context && `${context.owner}/${context.repo}/${context.number}:${context.base}:${context.head || ""}`;
  if (!context) {
    document.getElementById(ROOT_ID)?.remove();
    navigationKey = key || "";
    cachedContext = null;
    cachedStack = null;
    return;
  }
  // Do not repeat network requests when unrelated parts of the page mutate.
  if (key === navigationKey) return;

  navigationKey = key;
  const version = ++requestVersion;
  try {
    const stack = await findStack(context);
    if (version === requestVersion && key === navigationKey) {
      // A lone PR targeting the trunk is not a stack. Keep the sidebar clean
      // unless there is at least one related PR to render.
      if (stack.length < 2) {
        document.getElementById(ROOT_ID)?.remove();
        cachedContext = null;
        cachedStack = null;
        return;
      }

      await Promise.all(stack.map(async (pull) => {
        if (pull.state !== "merged") {
          pull.checkStatus = await findCheckStatus(context, pull);
        }
      }));

      cachedContext = context;
      cachedStack = stack;
      renderStack(context, stack);
    }
  } catch (error) {
    console.debug("GitHub Parent PR:", error);
  }
}

// GitHub uses Turbo navigation, so the document can change without a full reload.
document.addEventListener("turbo:load", update);
document.addEventListener("pjax:end", update);
new MutationObserver(() => {
  const renderedStack = document.getElementById(ROOT_ID);
  if (renderedStack && cachedContext && cachedStack) {
    const current = cachedStack.find((pull) => pull.current);
    const latest = currentPullData(cachedContext);
    if (current && latest.state !== current.state) {
      current.state = latest.state;
      renderStack(cachedContext, cachedStack);
    }
    return;
  }
  if (cachedContext && cachedStack) renderStack(cachedContext, cachedStack);
  update();
}).observe(document.documentElement, { childList: true, subtree: true });

update();
