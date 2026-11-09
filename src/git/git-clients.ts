import { Platform } from '../types';

export interface GitFile {
  content: string;
  sha?: string;
  exists: boolean;
}

export interface DirEntry {
  name: string;
  type: 'dir' | 'file';
  path: string;
}

export interface GitAdapter {
  getRepo(token: string, fullName: string): Promise<any>;
  getFile(
    token: string,
    fullName: string,
    path: string,
    ref: string,
  ): Promise<GitFile>;
  listRepos(
    token: string,
  ): Promise<{ full_name: string; default_branch: string }[]>;
  getContents(
    token: string,
    fullName: string,
    path: string,
    ref: string,
  ): Promise<DirEntry[]>;
  getProfile(token: string): Promise<{ login: string; avatar_url?: string }>;
}

export const getGitAdapter = (platform: Platform): GitAdapter => {
  if (platform === 'github') return new GitHubAdapter();
  return new GitLabAdapter();
};

export class GitHubAdapter implements GitAdapter {
  constructor(private api = 'https://api.github.com') {}

  private async req(token: string, url: string, init?: RequestInit) {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) throw new Error(`github_api_error:${res.status}`);
    return res.json();
  }

  async getRepo(token: string, fullName: string) {
    return this.req(token, `${this.api}/repos/${fullName}`);
  }

  async getFile(
    token: string,
    fullName: string,
    path: string,
    ref: string,
  ): Promise<GitFile> {
    try {
      const data = await this.req(
        token,
        `${this.api}/repos/${fullName}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`,
      );
      return {
        content: Buffer.from(data.content, 'base64').toString('utf-8'),
        sha: data.sha,
        exists: true,
      };
    } catch {
      return { content: '', exists: false };
    }
  }

  async listRepos(token: string) {
    const repos: any[] = [];
    let page = 1;
    for (;;) {
      const pageRepos: any[] = await this.req(
        token,
        `${this.api}/user/repos?per_page=100&sort=updated&page=${page}`,
      );
      repos.push(...pageRepos);
      if (pageRepos.length < 100) break;
      page++;
    }
    return repos.map((r: any) => ({
      full_name: r.full_name,
      default_branch: r.default_branch,
    }));
  }

  async getContents(
    token: string,
    fullName: string,
    path: string,
    ref: string,
  ): Promise<DirEntry[]> {
    const data = await this.req(
      token,
      `${this.api}/repos/${fullName}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`,
    );
    if (!Array.isArray(data)) return []; // path is a file
    return data.map((e: any) => ({
      name: e.name,
      type: e.type === 'dir' ? 'dir' : 'file',
      path: e.path,
    }));
  }

  async getProfile(token: string) {
    const p = await this.req(token, `${this.api}/user`);
    return { login: p.login, avatar_url: p.avatar_url };
  }
}

export class GitLabAdapter implements GitAdapter {
  constructor(private api = 'https://gitlab.com/api/v4') {}

  private enc(fullName: string) {
    return encodeURIComponent(fullName);
  }

  private async req(token: string, url: string, init?: RequestInit) {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    });
    if (!res.ok) throw new Error(`gitlab_api_error:${res.status}`);
    return res.json();
  }

  async getRepo(token: string, fullName: string) {
    return this.req(token, `${this.api}/projects/${this.enc(fullName)}`);
  }

  async getFile(
    token: string,
    fullName: string,
    path: string,
    ref: string,
  ): Promise<GitFile> {
    const res = await fetch(
      `${this.api}/projects/${this.enc(fullName)}/repository/files/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return { content: '', exists: false };
    const data = await res.json();
    return {
      content: Buffer.from(data.content, 'base64').toString('utf-8'),
      sha: data.last_commit_id,
      exists: true,
    };
  }

  async listRepos(token: string) {
    const projects: any[] = [];
    let page = 1;
    for (;;) {
      const pageProjects: any[] = await this.req(
        token,
        `${this.api}/projects?membership=true&per_page=100&order_by=last_activity_at&page=${page}`,
      );
      projects.push(...pageProjects);
      if (pageProjects.length < 100) break;
      page++;
    }
    return projects.map((p: any) => ({
      full_name: p.path_with_namespace.replace(/^\//, ''),
      default_branch: p.default_branch,
    }));
  }

  async getContents(
    token: string,
    fullName: string,
    path: string,
    ref: string,
  ): Promise<DirEntry[]> {
    const data = await this.req(
      token,
      `${this.api}/projects/${this.enc(fullName)}/repository/tree?path=${encodeURIComponent(path)}&ref=${encodeURIComponent(ref)}&per_page=100`,
    );
    return data.map((e: any) => ({
      name: e.name,
      type: e.type === 'tree' ? 'dir' : 'file',
      path: e.path,
    }));
  }

  async getProfile(token: string) {
    const p = await this.req(token, `${this.api}/user`);
    return { login: p.username, avatar_url: p.avatar_url };
  }
}
