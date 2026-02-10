import { spawn } from "node:child_process";

export type GitAccessErrorKind = "auth" | "network" | "unknown";

export async function verifyRepositoryAccess(
  repoUrl: string,
  branch: string,
  timeoutMs = 120_000
): Promise<void> {
  const args = ["ls-remote", "--heads", repoUrl, branch];
  await new Promise<void>((resolve, reject) => {
    const child = spawn("git", args, {
      stdio: "pipe",
      shell: false,
      env: process.env,
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Git authentication timed out"));
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      const message = stderr.trim();
      if (message) {
        reject(new Error(message));
        return;
      }
      reject(new Error(`git ${args.join(" ")} failed with exit code ${code ?? "unknown"}`));
    });
  });
}

export function classifyGitAccessError(message: string): GitAccessErrorKind {
  const text = message.toLowerCase();
  if (
    text.includes("authentication failed") ||
    text.includes("auth failed") ||
    text.includes("permission denied") ||
    text.includes("could not read username") ||
    text.includes("repository not found") ||
    text.includes("access denied") ||
    text.includes("fatal: could not read from remote repository")
  ) {
    return "auth";
  }
  if (
    text.includes("could not resolve host") ||
    text.includes("network is unreachable") ||
    text.includes("connection timed out") ||
    text.includes("operation timed out") ||
    text.includes("failed to connect") ||
    text.includes("tls") ||
    text.includes("temporary failure in name resolution")
  ) {
    return "network";
  }
  return "unknown";
}

export function buildAuthHint(
  repoUrl: string,
  auth: "ssh" | "https"
): string {
  const host = extractGitHost(repoUrl);
  if (auth === "ssh") {
    return `Verify SSH key and host trust for ${host}, e.g. \`ssh -T git@${host}\`.`;
  }

  switch (host) {
    case "github.com":
      return "Use GitHub credentials (PAT/GCM) for https://github.com.";
    case "gitlab.com":
      return "Use GitLab credentials (PAT/GCM) for https://gitlab.com.";
    case "bitbucket.org":
      return "Use Bitbucket app password or token (via GCM).";
    default:
      return `Configure HTTPS credentials (PAT/GCM) for ${host}.`;
  }
}

export function extractGitHost(repoUrl: string): string {
  const trimmed = repoUrl.trim();
  // git@host:owner/repo.git
  const sshScpMatch = /^.+@([^:]+):.+$/.exec(trimmed);
  if (sshScpMatch) {
    return sshScpMatch[1].toLowerCase();
  }
  try {
    const withScheme = trimmed.includes("://") ? trimmed : `ssh://${trimmed}`;
    const u = new URL(withScheme);
    return (u.hostname || "your-git-host").toLowerCase();
  } catch {
    return "your-git-host";
  }
}
