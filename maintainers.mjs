import { Octokit } from "@octokit/core";
import { paginateGraphQL } from "@octokit/plugin-paginate-graphql";
import { Command } from 'commander';
const program = new Command();
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const fs = require('fs');
const yaml = require('js-yaml');

program
  .name('GitHub Maintainers')
  .description('CLI to get maintainers given a defined config file')
  .version('0.0.1')
  .requiredOption('-g, --gh-api-key <value>', 'GitHub API key')
  .requiredOption('-c, --config <value>', 'Configuration file')
  .option('--output-csv <value>', 'Github Repository','output.csv');

program.parse();
const options = program.opts();
const MyOctokit = Octokit.plugin(paginateGraphQL);
const octokit = new MyOctokit({ auth: options.ghApiKey });
const checkdate = Intl.DateTimeFormat('en-CA').format(new Date().setFullYear(new Date().getFullYear() - 1))
let data = new Map()
let doc;
try {
  doc = yaml.load(fs.readFileSync(options.config, 'utf8'));
} catch (e) {
  console.log(e);
}

for ( let x in doc ) {
  console.log(`Loading projects for ${doc[x]['umbrella']}`)
  let umbrella = new Map()
  for ( let projectName in doc[x]['projects']) {
    console.log(`Processing ${doc[x]['projects'][projectName]['project']}`)
    let project = new Map()
    for ( let repoURL in doc[x]['projects'][projectName]['repos'] ) {
      console.log(`Getting maintainers for ${doc[x]['projects'][projectName]['repos'][repoURL]}`)
      let uri = doc[x]['projects'][projectName]['repos'][repoURL].replace('https://github.com/','');
      let [org, repo] = uri.split("/");
      let querystring = " org:".concat(org) 
      if ( repo ) {
        querystring = " repo:".concat(org,'/',repo) 
      }
      const pageIterator = octokit.graphql.paginate.iterator(
      `query paginate($cursor: String){
        search(query: "${querystring} is:pr merged:>${checkdate}", type: ISSUE, first:100, after: $cursor) {
          edges {
            node {
              ... on PullRequest {
                url 
                mergedAt
                mergedBy {
                  login
                  ... on User {
                    email
                    name
                  }
                }
                repository {
                  name
                  url
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`,
      );
      let counter = 1
      for await (const response of pageIterator) {
        console.log(`Loading first ${100*counter++} records...`)

        const prs = response.search.edges
        for (let i = 0; i < prs.length; i++) {
          let pr = null
          if (project.has(prs[i].node.mergedBy.login)) {
            pr = project.get(prs[i].node.mergedBy.login)
            pr.set('count',pr.get('count')+1)
            if (pr.get('firstMerged')>prs[i].node.mergedAt) {
              pr.set('firstMerged',prs[i].node.mergedAt)
            }
            if (pr.get('lastMerged')<prs[i].node.mergedAt) {
              pr.set('lastMerged',prs[i].node.mergedAt)
            }
            var repolist = pr.get('repos')
            repolist.push(prs[i].node.repository.url.replace('https://github.com/',''))
            pr.set('repos',repolist)
          }
          else {
            pr = new Map()
            
            pr.set('lastMerged',prs[i].node.mergedAt)
            pr.set('name',prs[i].node.mergedBy.name)
            pr.set('email',prs[i].node.mergedBy.email)
            pr.set('firstMerged',prs[i].node.mergedAt)
            pr.set('count',1)
            pr.set('repos', [prs[i].node.repository.url.replace('https://github.com/','')])
          }
          project.set(prs[i].node.mergedBy.login,pr)
        }
      }
    }
    umbrella.set(doc[x]['projects'][projectName]['project'],project)  
  }
  data.set(doc[x]['umbrella'],umbrella)
}

console.log("Converting to CSV file")

let outputcsv = 'Umbrella,Project,GitHubID,Name,Email,FirstMerge,LastMerge,Count,Repos\n'
for (let [umbrella, projects] of data) {
  for (let [projectName, project] of projects) {
    for (let [maintainerName,maintainer] of project) {
      outputcsv = outputcsv.concat(`"${umbrella}","${projectName}","${maintainerName}","${maintainer.get("name")}","${maintainer.get('email')}","${maintainer.get('firstMerged')}","${maintainer.get('lastMerged')}","${maintainer.get('count')}","${[...new Set(maintainer.get('repos'))].join()}"\n`)

    }
  }
}

fs.writeFile(options.outputCsv, outputcsv, 'utf8', function (err) {
  if (err) {
    console.log('Some error occured - file either not saved or corrupted file saved.');
  } else{
    console.log('It\'s saved!');
  }
});

