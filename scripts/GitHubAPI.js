import fetch from "node-fetch";
import { Octokit } from "octokit";

class GitHubAPIService {
  constructor(args) {
    this.baseUrl = args.baseUrl || process.env["GITHUB_API_URL"];
    this.repository = args.repository || process.env["GITHUB_REPOSITORY"];
    this.token = args.token || process.env["CI_GITHUB_TOKEN"];
    this.repoUrl = `${this.baseUrl}/repos/${this.repository}`;
    this.octokit = new Octokit({
      auth: this.token
    });

    var repoParameters = this.repository.split("/");
    this.owner = repoParameters[0];
    this.repo = repoParameters[1];
  }

  getChangelogWikiPage() {
    return fetch(`${this.repoUrl}/wikis/CHANGELOG`, {
      method: "GET",
      headers: {
        "User-Agent": "request",
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json"
      }
    }).then((response) => {
      if (!response.ok) {
        throw `The server responded with ${response.status}: ${response.statusText}`;
      }

      return response.json();
    });
  }

  createChangelogWikiPage(content) {
    return fetch(`${this.repoUrl}/wikis`, {
      method: "POST",
      headers: {
        "User-Agent": "request",
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: "CHANGELOG",
        content,
        format: "markdown"
      })
    }).then((response) => {
      if (!response.ok) {
        throw `The server responded with ${response.status}: ${response.statusText}`;
      }

      return response.json();
    });
  }

  editChangelogWikiPage(content) {
    return fetch(`${this.repoUrl}/wikis/CHANGELOG`, {
      method: "PUT",
      headers: {
        "User-Agent": "request",
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: "CHANGELOG",
        content
      })
    }).then((response) => {
      if (!response.ok) {
        throw `The server responded with ${response.status}: ${response.statusText}`;
      }

      return response.json();
    });
  }

  /**
   * Método que recupera la información disponible de un commit a partir de su identificador
   * @param {String} commitId Identificador sha del commit del que se quiere obtener la información
   * @returns
   */
  async getCommit(commitId) {
    console.log("Getting commit info");
    const { data, error } = await this.octokit.rest.git.getCommit({
      owner: this.owner,
      repo: this.repo,
      commit_sha: commitId
    });

    if (data) {
      return data;
    } else {
      throw `The server responded with ${error}`;
    }
  }

  /**
   *
   * @param {string} commit_tag Referencia del tag
   */
  async getTag(tagName) {
    console.log("Getting tag");

    const { data, error } = await this.octokit.request(
      "GET /repos/{owner}/{repo}/commits/{ref}",
      {
        owner: this.owner,
        repo: this.repo,
        ref: `tags/${tagName}`
      }
    );

    if (!data) {
      throw `The server responded with ${error.status}`;
    }

    return data;
  }

  /**
   */
  async getTags() {
    console.log("Getting tags");

    const { data, error } = await this.octokit.request(
      "GET /repos/{owner}/{repo}/tags?per_page={per_page}",
      {
        owner: this.owner,
        repo: this.repo,
        per_page: 100
      }
    );

    if (!data) {
      throw `The server responded with ${error.status}`;
    }

    return data;
  }

  /**
   *
   * @param {string} commit_tag Referencia del tag
   */
  async getTagHeadBranchRefs(commitId) {
    var { data, error } =
      await this.octokit.rest.repos.listBranchesForHeadCommit({
        owner: this.owner,
        repo: this.repo,
        commit_sha: commitId
      });

    if (!data) {
      throw `The server responded with ${error}`;
    }

    return data;
  }

  /**
   * Método que primero genera la tag y a continuación crea la referencia de la tag generada
   * @param {tag_name, ref, message, type} tag Etiqueta a generar
   * @param tag.tag_name nombre de la tag a crear
   * @param tag.ref referencia a crear
   * @param tag.message mensaje a indicar
   * @param tag.type tipo de objeto para el que se crea la referencia
   */
  async createTag(tag) {
    console.log("Creating tag");

    var { data, error } = await this.octokit.rest.git.createTag({
      owner: this.owner,
      repo: this.repo,
      tag: tag.tag_name,
      message: tag.message,
      object: tag.ref,
      type: tag.type
    });

    if (data) {
      var lightTag = data;
      data = await this.createRef({
        name: `refs/tags/${lightTag.tag}`,
        sha: tag.ref
      });

      if (data) {
        return data;
      } else {
        throw `The server responded with ${error}`;
      }
    } else {
      throw `The server responded with ${error}`;
    }
  }

  /**
   *
   * @param {BranchRequest} branch
   * @param {string} branch.branch Etiqueta a generar
   * @parma {string} branch.ref Referencia GIT sobre la que generar rama
   */
  createBranch(branch) {
    console.log(`Fetching ${this.repoUrl}/repository/branches`);
    return fetch(`${this.repoUrl}/repository/branches`, {
      method: "POST",
      headers: {
        "User-Agent": "request",
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(branch)
    }).then((response) => {
      if (!response.ok) {
        throw `The server responded with ${response.statusText}`;
      }

      return response.json();
    });
  }

  /**
   *
   * @param {CompareRequest} request
   * @param {string} request.from Etiqueta a generar
   * @parma {string} request.to Referencia GIT sobre la que generar rama
   */
  async compare(request) {
    var { data, error } = await this.octokit.rest.repos.compareCommits({
      owner: this.owner,
      repo: this.repo,
      base: request.to,
      head: request.from
    });

    if (data) {
      return data;
    } else {
      throw `The server responded with ${error}`;
    }

    /*
    console.log(
      `Fetching ${this.repoUrl}/repository/compare?from=${request.from}&to=${request.to}`
    );
    return fetch(
      `${this.repoUrl}/repository/compare?from=${request.from}&to=${request.to}`,
      {
        method: "GET",
        headers: {
          "User-Agent": "request",
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json"
        }
      }
    ).then((response) => {
      if (!response.ok) {
        throw `The server responded with ${response.statusText}`;
      }

      return response.json();
    });*/
  }

  createCommit(commit) {
    console.log(`Fetching ${this.repoUrl}/repository/commits`);
    return fetch(`${this.repoUrl}/repository/commits`, {
      method: "POST",
      headers: {
        "User-Agent": "request",
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(commit)
    }).then((response) => {
      if (!response.ok) {
        throw `The server responded with ${response.statusText}`;
      }

      return response.json();
    });
  }

  /**
   *
   * @param {PRRequest} pullRequest
   * @param {string} pullRequest.title Nombre del R
   * @param {string} pullRequest.source_branch Rama origen
   * @param {string} pullRequest.target_branch  Rama destino
   */
  async createPullRequest(pullRequest) {
    console.log("Creating Pull Request");

    const { data, error } = await this.octokit.rest.pulls.create({
      owner: this.owner,
      repo: this.repo,
      title: pullRequest.title,
      head: pullRequest.source_branch,
      base: pullRequest.target_branch
    });

    if (data) {
      return data;
    } else {
      throw `The server responded with ${error}`;
    }
  }

  /**
   *
   * @param {PROptionsRequest} options
   * @param {Boolean} mergeRequest.method Método de mergeo. Opciones: merge, squash o rebase
   * @param {Boolean} mergeRequest.should_remove_source_branch
   */
  async mergePullRequest(iid, options) {
    console.log("Merging Pull Request");
    const { data, error } = await this.octokit.rest.pulls.merge({
      owner: this.owner,
      repo: this.repo,
      merge_method: options.method,
      pull_number: iid
    });

    if (data) {
      return data;
    } else {
      throw `The server responded with ${error}`;
    }
  }

  /**
   * Método que crea una rama o una tag en Github a partir del nombre completo y su identificador sha
   * @param {CreateRefRequest} ref
   * @param {String} ref.name Nombre de la referencia a crear
   * @param {String} ref.sha Identificador de la referencia a crear
   * @returns
   */
  async createRef(ref) {
    console.log(`Creating ref ${ref.name}`);
    const { data, error } = await this.octokit.rest.git.createRef({
      owner: this.owner,
      repo: this.repo,
      ref: ref.name,
      sha: ref.sha
    });

    if (data) {
      return data;
    } else {
      throw `The server responded with ${error}`;
    }
  }
}

export default GitHubAPIService;
