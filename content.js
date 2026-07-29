const ROOT_ID = "github-parent-pr";
const DEFAULT_BRANCHES = new Set(["main", "master"]);

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
    icon.innerHTML = state === "draft"
      ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.75 3.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm0 9a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0ZM3.5 5.75v4.5M13.75 3.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm-1.25 2.25v1.5"/></svg>'
      : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.75 3.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm0 9a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0ZM3.5 5.75v4.5m9-5v3.5a3.25 3.25 0 0 1-3.25 3.25H7"/></svg>';

    const link = document.createElement("a");
    link.href = pull.url;
    link.className = "Link--primary github-pr-stack__link";
    link.title = pull.title;
    link.textContent = `#${pull.number} ${pull.title}`;
    if (pull.current) link.setAttribute("aria-current", "page");

    const stateLabel = document.createElement("span");
    stateLabel.className = `github-pr-stack__state is-${state}`;
    stateLabel.textContent = state[0].toUpperCase() + state.slice(1);

    item.append(icon, link, stateLabel);
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
