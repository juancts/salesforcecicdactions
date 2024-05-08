/**
 * Finalización de release. Basado en pipelines
 *
 * @author jmartinezpisson
 */
import GitHubAPIService from "./GitHubAPI.js";

async function main() {
  const gitHubService = new GitHubAPIService({
    baseUrl: process.env["GITHUB_API_URL"],
    repository: process.env["GITHUB_REPOSITORY"],
    token: process.env["CI_GITHUB_TOKEN"]
  });

  let reference = process.env["GITHUB_REF"]; //Referencia completa de la rama o Tag
  let refName = reference.replace("refs/heads/", "").replace("refs/tags/", "");

  let tag = await gitHubService.getTag(refName);
  let refs = await gitHubService.getTagHeadBranchRefs(tag.sha);
  let isRelease = false;
  let releaseBranch;

  refs.forEach((ref) => {
    if (ref.name.includes("release")) {
      isRelease = true;
      releaseBranch = ref.name;
    }
  });

  if (isRelease) {
    console.log("Commit is in release branch");
    let { number } = await gitHubService.createPullRequest({
      title: `Merge branch ${releaseBranch} to master`,
      source_branch: `${releaseBranch}`,
      target_branch: "master"
    });
  } else {
    console.log('Commit is not in branch "release". Aborting...');
  }
}

await main();

/**
 * Finalización de release. Basado en pipelines
 *
 * @author jmartinezpisson
 */
//import GitHubAPIService from "./GitHubAPI.js";

// async function main() {
//   const gitHubService = new GitHubAPIService({
//     baseUrl: process.env["GITHUB_API_URL"],
//     repository: process.env["GITHUB_REPOSITORY"],
//     token: process.env["CI_GITHUB_TOKEN"]
//   });

//   let reference = process.env["GITHUB_REF"]; //Referencia completa de la rama o Tag
//   let refName = reference.replace("refs/heads/", "").replace("refs/tags/", "");

//   let tag = await gitHubService.getTag(refName);
//   let refs = await gitHubService.getTagHeadBranchRefs(tag.sha);
//   let isRelease = false;
//   let releaseBranch;

//   refs.forEach((ref) => {
//     if (ref.name.includes("release")) {
//       isRelease = true;
//       releaseBranch = ref.name;
//     }
//   });

//   if (isRelease) {
//     console.log("Commit is in release branch");
//     let { number } = await gitHubService.createPullRequest({
//       title: `Merge branch ${releaseBranch} to master`,
//       source_branch: `${releaseBranch}`,
//       target_branch: "master"
//     });
//   } else {
//     console.log('Commit is not in branch "release". Aborting...');
//   }
// }

// await main();