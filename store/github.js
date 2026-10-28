import { findSwapByProjectName, getRepoPath } from "./swaps.js";

// The agent passes the model's check_health arguments into this function.
export async function checkHealth({ project_name } = {}) {
  if (typeof project_name !== "string" || !project_name.trim()) {
    return {
      status: "error",
      retryable: false,
      message: "check_health requires a project_name string.",
    };
  }

  // Find the catalog entry so we can connect its display name to a GitHub repo.
  const swap = findSwapByProjectName(project_name);

  if (!swap) {
    return {
      status: "no_results",
      message: "Project doesn't exist in the OpenSwap database: " + project_name + ". Try again with another official name for the project before answering.",
    };
  }

  const repoPath = getRepoPath(swap);

  if (!repoPath) {
    return {
      status: "no_results",
      message: "\"" + swap.name + "\" has no GitHub repo on record, so it can't be health-checked.",
    };
  }

  // Fetch the repository first, then its latest commit and recent releases.
  const providerResult = await getRepoHealth(repoPath);

  if (!providerResult.ok) {
    return describeGitHubFailure(providerResult.statusCode, swap.name);
  }

  const health = providerResult.data;
  const releaseSummary = providerResult.releaseRequest.ok
    ? describeReleaseFreshness(health.days_since_last_release)
    : "release data unavailable";

  // Return the shared tool-result vocabulary plus the GitHub evidence.
  return {
    status: "ok",
    project: swap.name,
    ...health,
    ...(providerResult.releaseRequest.ok
      ? {}
      : { warning: "GitHub repository data loaded, but release data was unavailable." }),
    message:
      swap.name + ": last commit " + formatAgo(health.days_since_last_commit) +
      ", " + releaseSummary + ".",
  };
}

const GITHUB_API = "https://api.github.com";
const RELEASE_WINDOW_DAYS = 90;
const RELEASES_PER_PAGE = 100;

async function getRepoHealth(repoPath) {
  const repoResponse = await fetchFromGitHub("/repos/" + repoPath);

  // Without the repository details, there is no health check to return.
  if (!repoResponse.ok) {
    return {
      ok: false,
      statusCode: repoResponse.statusCode,
    };
  }

  const commitResponse = await fetchFromGitHub(
    "/repos/" + repoPath + "/commits?per_page=1"
  );

  // The latest commit is core health evidence, so this request must succeed.
  if (!commitResponse.ok) {
    return {
      ok: false,
      statusCode: commitResponse.statusCode,
    };
  }

  const releaseResponse = await fetchFromGitHub(
    "/repos/" + repoPath + "/releases?per_page=" + RELEASES_PER_PAGE
  );
  const commits = Array.isArray(commitResponse.data) ? commitResponse.data : [];
  // A project can still be health-checked when release data is unavailable.
  const releases = releaseResponse.ok && Array.isArray(releaseResponse.data)
    ? releaseResponse.data
    : [];

  return {
    ok: true,
    data: shapeRepoHealth(repoPath, repoResponse.data, commits, releases),
    releaseRequest: {
      ok: releaseResponse.ok,
      statusCode: releaseResponse.statusCode,
    },
  };
}

async function fetchFromGitHub(path) {
  // These headers select GitHub's JSON API and identify the application.
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "openswap-health-check",
  };

  // A token is optional, but it gives the app a much higher rate limit.
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = "Bearer " + process.env.GITHUB_TOKEN;
  }

  const response = await fetch(GITHUB_API + path, { headers });
  // Some failed GitHub responses have no JSON body, so parsing may return null.
  const data = await response.json().catch(() => null);

  return {
    ok: response.ok,
    statusCode: response.status,
    data,
  };
}

function shapeRepoHealth(repoPath, repo, commits, releases) {
  const latestCommit = commits[0]?.commit?.committer?.date
    ?? commits[0]?.commit?.author?.date
    ?? null;
  const latestRelease = releases[0] ?? null;

  // Shape GitHub's responses into the small set of facts the agent needs.
  return {
    repo: repoPath,
    archived: repo.archived ?? false,
    last_commit_date: toDateString(latestCommit),
    days_since_last_commit: daysSince(latestCommit),
    // GitHub's open_issues_count includes open pull requests.
    open_issues: repo.open_issues_count ?? null,
    latest_version: latestRelease?.tag_name ?? null,
    days_since_last_release: daysSince(latestRelease?.published_at),
    releases_last_90_days: countReleasesWithin(releases, RELEASE_WINDOW_DAYS),
    stars: repo.stargazers_count ?? null,
    license: repo.license?.spdx_id ?? null,
  };
}

function describeGitHubFailure(statusCode, projectName) {
  if (statusCode === 404) {
    return {
      status: "no_results",
      message: "GitHub has no repo for \"" + projectName + "\" (it may have been renamed or removed).",
    };
  }

  if (statusCode === 401) {
    return {
      status: "error",
      retryable: false,
      message: "GitHub rejected the token. Check GITHUB_TOKEN in your .env.",
    };
  }

  if (statusCode === 403 || statusCode === 429) {
    return {
      status: "error",
      retryable: true,
      message: "GitHub rate limit reached. Add a GITHUB_TOKEN or wait before retrying.",
    };
  }

  return {
    status: "error",
    retryable: statusCode >= 500,
    message: "GitHub request failed with status " + statusCode + ".",
  };
}

function describeReleaseFreshness(days) {
  return days == null
    ? "no tagged releases yet"
    : "latest release " + formatAgo(days);
}

function formatAgo(days) {
  if (days == null) {
    return "unknown";
  }

  if (days === 0) {
    return "today";
  }

  return days + " day" + (days === 1 ? "" : "s") + " ago";
}

function toDateString(isoTimestamp) {
  return isoTimestamp ? isoTimestamp.slice(0, 10) : null;
}

function daysSince(isoTimestamp) {
  if (!isoTimestamp) {
    return null;
  }

  // Count complete days since the event.
  const millisPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((Date.now() - new Date(isoTimestamp).getTime()) / millisPerDay);
}

function countReleasesWithin(releases, windowDays) {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;

  // Count only published releases whose timestamp falls inside the window.
  return releases.filter((release) => {
    return release.published_at && new Date(release.published_at).getTime() >= cutoff;
  }).length;
}
