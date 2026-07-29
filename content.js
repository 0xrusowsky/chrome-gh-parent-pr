const ROOT_ID = "github-parent-pr";
const DEFAULT_BRANCHES = new Set(["main", "master"]);

let navigationKey = "";
let requestVersion = 0;

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
    target: parent.base?.ref
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
      url: new URL(link.getAttribute("href"), location.origin).href
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

function render(context, parent) {
  document.getElementById(ROOT_ID)?.remove();
  if (!parent || !context.baseElement.isConnected) return;

  const container = document.createElement("span");
  container.id = ROOT_ID;
  container.className = "github-parent-pr";

  const link = document.createElement("a");
  link.href = parent.url;
  link.className = "github-parent-pr__button";
  link.textContent = `Parent #${parent.number}`;
  link.title = `${parent.title}${parent.target ? ` → ${parent.target}` : ""}`;

  container.append(link);

  // Put the link beside the PR-level Code dropdown. The repository's Code
  // navigation tab is an <a>, while this control is a visible <button>.
  const codeButton = [...document.querySelectorAll("button")].find((button) => {
    const rect = button.getBoundingClientRect();
    return button.textContent?.trim() === "Code" && rect.width > 0 && rect.top < 400;
  });

  if (codeButton?.parentElement) {
    codeButton.parentElement.insertBefore(container, codeButton);
  } else {
    (context.summaryElement || context.baseElement.parentElement)?.append(container);
  }
}

async function update() {
  const context = pullContext();
  const key = context && `${context.owner}/${context.repo}/${context.number}:${context.base}`;
  if (!context || DEFAULT_BRANCHES.has(context.base.toLowerCase())) {
    document.getElementById(ROOT_ID)?.remove();
    navigationKey = key || "";
    return;
  }
  // Do not repeat network requests when unrelated parts of the page mutate.
  if (key === navigationKey) return;

  navigationKey = key;
  const version = ++requestVersion;
  try {
    const parent = await findParent(context);
    if (version === requestVersion && key === navigationKey) render(context, parent);
  } catch (error) {
    console.debug("GitHub Parent PR:", error);
  }
}

// GitHub uses Turbo navigation, so the document can change without a full reload.
document.addEventListener("turbo:load", update);
document.addEventListener("pjax:end", update);
new MutationObserver(() => {
  if (!document.getElementById(ROOT_ID)) update();
}).observe(document.documentElement, { childList: true, subtree: true });

update();
