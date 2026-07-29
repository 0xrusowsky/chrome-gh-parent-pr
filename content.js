const ROOT_ID = "github-parent-pr";
const DEFAULT_BRANCHES = new Set(["main", "master"]);

// The same Microsoft Codicons used by Supacode.
const PR_ICON_PATHS = {
  open: "M13 10.05V5.5C13 4.12 11.88 3 10.5 3H8.71L9.85 1.85C10.05 1.66 10.05 1.34 9.85 1.15C9.66.95 9.34.95 9.15 1.15L7.15 3.15C6.95 3.34 6.95 3.66 7.15 3.85L9.15 5.85C9.34 6.05 9.66 6.05 9.85 5.85C10.05 5.66 10.05 5.34 9.85 5.15L8.71 4H10.5C11.33 4 12 4.67 12 5.5V10.05C10.86 10.28 10 11.29 10 12.5C10 13.88 11.12 15 12.5 15S15 13.88 15 12.5C15 11.29 14.14 10.28 13 10.05ZM12.5 14C11.67 14 11 13.33 11 12.5S11.67 11 12.5 11 14 11.67 14 12.5 13.33 14 12.5 14ZM6 3.5C6 2.12 4.88 1 3.5 1S1 2.12 1 3.5C1 4.71 1.86 5.72 3 5.95V10.05C1.86 10.28 1 11.29 1 12.5 1 13.88 2.12 15 3.5 15S6 13.88 6 12.5C6 11.29 5.14 10.28 4 10.05V5.95C5.14 5.72 6 4.71 6 3.5ZM2 3.5C2 2.67 2.67 2 3.5 2S5 2.67 5 3.5 4.33 5 3.5 5 2 4.33 2 3.5ZM5 12.5C5 13.33 4.33 14 3.5 14S2 13.33 2 12.5 2.67 11 3.5 11 5 11.67 5 12.5Z",
  draft: "M6 3.5C6 2.12 4.88 1 3.5 1S1 2.12 1 3.5C1 4.71 1.86 5.72 3 5.95V10.05C1.86 10.28 1 11.29 1 12.5 1 13.88 2.12 15 3.5 15S6 13.88 6 12.5C6 11.29 5.14 10.28 4 10.05V5.95C5.14 5.72 6 4.71 6 3.5ZM5 12.5C5 13.33 4.33 14 3.5 14S2 13.33 2 12.5 2.67 11 3.5 11 5 11.67 5 12.5ZM3.5 5C2.67 5 2 4.33 2 3.5S2.67 2 3.5 2 5 2.67 5 3.5 4.33 5 3.5 5ZM12.5 10C11.12 10 10 11.12 10 12.5S11.12 15 12.5 15 15 13.88 15 12.5 13.88 10 12.5 10Zm0 4C11.67 14 11 13.33 11 12.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5Zm-1-6.5a1 1 0 1 1 2 0 1 1 0 0 1-2 0Zm0-4a1 1 0 1 1 2 0 1 1 0 0 1-2 0Z",
  closed: "M13 10.05V7.5a.5.5 0 0 0-1 0v2.55A2.5 2.5 0 1 0 13 10.05ZM12.5 14a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM6 3.5A2.5 2.5 0 1 0 3 5.95v4.1A2.5 2.5 0 1 0 4 10.05v-4.1A2.5 2.5 0 0 0 6 3.5ZM3.5 14a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm0-9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm7.15-.35 1.15-1.15-1.15-1.15a.5.5 0 0 1 .7-.7l1.15 1.14 1.15-1.14a.5.5 0 0 1 .7.7L13.21 3.5l1.14 1.15a.5.5 0 0 1-.7.7L12.5 4.21l-1.15 1.14a.5.5 0 0 1-.7-.7Z"
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
  return { owner, repo, number: Number(number), base, baseElement, summaryElement }; 
}

function apiHeaders() {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
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

    return {
      number: Number(match[1]),
      title,
      url: new URL(link.getAttribute("href"), location.origin).href,
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

function currentPullData(context) {
  for (const script of document.querySelectorAll('script[data-target="react-app.embeddedData"]')) {
    try {
      const data = JSON.parse(script.textContent);
      const pull = data?.payload?.pullRequestsConversationsRoute?.pullRequest
        || data?.payload?.pullRequest;
      if (pull?.number === context.number) {
        return {
          title: pull.title,
          state: pull.state?.toLowerCase() === "draft" ? "draft" : pull.state?.toLowerCase()
        };
      }
    } catch {
      // Ignore embedded data belonging to unrelated React applications.
    }
  }

  return {
    title: document.title.split(" · Pull Request")[0].replace(/ by [^·]+$/, "").trim(),
    state: "open"
  };
}

async function findStack(context) {
  const current = currentPullData(context);
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

  return stack.reverse();
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

  const section = document.createElement("div");
  section.id = ROOT_ID;
  section.className = "github-pr-stack discussion-sidebar-item sidebar-assignee";

  const heading = document.createElement("h3");
  heading.className = "discussion-sidebar-heading text-bold";
  heading.textContent = "Stack";
  section.append(heading);

  const list = document.createElement("ol");
  list.className = "github-pr-stack__list";

  for (const pull of stack) {
    const state = pull.state || "open";
    const item = document.createElement("li");
    item.className = pull.current ? "github-pr-stack__item is-current" : "github-pr-stack__item";

    const icon = document.createElement("span");
    icon.className = `github-pr-stack__icon is-${state}`;
    icon.title = state[0].toUpperCase() + state.slice(1);
    icon.setAttribute("aria-label", icon.title);
    const iconPath = PR_ICON_PATHS[state] || PR_ICON_PATHS.open;
    icon.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${iconPath}"/></svg>`;

    const link = document.createElement("a");
    link.href = pull.url;
    link.className = "Link--primary github-pr-stack__link";
    link.title = pull.title;
    link.textContent = `#${pull.number} ${pull.title}`;
    if (pull.current) link.setAttribute("aria-current", "page");

    item.append(icon, link);
    if (state !== "open") {
      const stateLabel = document.createElement("span");
      stateLabel.className = `github-pr-stack__state is-${state}`;
      stateLabel.textContent = state[0].toUpperCase() + state.slice(1);
      item.append(stateLabel);
    }
    list.append(item);
  }

  section.append(list);
  reviewersSection.before(section);
  return true;
}

async function update() {
  const context = pullContext();
  const key = context && `${context.owner}/${context.repo}/${context.number}:${context.base}`;
  if (!context || DEFAULT_BRANCHES.has(context.base.toLowerCase())) {
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
  if (document.getElementById(ROOT_ID)) return;
  if (cachedContext && cachedStack) renderStack(cachedContext, cachedStack);
  update();
}).observe(document.documentElement, { childList: true, subtree: true });

update();
