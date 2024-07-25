import { Octokit } from "@octokit/core";
import { paginateGraphQL } from "@octokit/plugin-paginate-graphql";
import { Command } from 'commander';
const program = new Command();

program
  .name('GitHub Maintainers')
  .description('CLI to get maintainers for a given GitHub org or repo')
  .version('0.0.1')
  .requiredOption('-g, --gh-api-key <value>', 'GitHub API key')
  .requiredOption('-o, --org <value>', 'GitHub Organization')
  .option('-r, --repo <value>', 'Github Repository')
  .option('--output-csv <value>', 'Github Repository','output.csv');

program.parse();
const options = program.opts();
const MyOctokit = Octokit.plugin(paginateGraphQL);
const octokit = new MyOctokit({ auth: options.ghApiKey });

var querystring = " org:".concat(options.org) 
if ( options.repo ) {
  querystring = " repo:".concat(options.org,'/',options.repo) 
}
var checkdate = Intl.DateTimeFormat('en-CA').format(new Date().setFullYear(new Date().getFullYear() - 1))
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
          repository {name}
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
var data = new Map()

if ( options.repo ) {
  console.log("Maintainers for ".concat(options.org,'/',options.repo))
}
else {
  console.log("Maintainers for ".concat(options.org))
}
console.log("Starting to load records")
var counter = 1
for await (const response of pageIterator) {
  console.log(`Loading first ${100*counter++} records...`)

  const prs = response.search.edges
  for (let i = 0; i < prs.length; i++) {
    var pr = null
    if (data.has(prs[i].node.mergedBy.login)) {
      pr = data.get(prs[i].node.mergedBy.login)
      pr.set('count',pr.get('count')+1)
      if (pr.get('firstMerged')>prs[i].node.mergedAt) {
        pr.set('firstMerged',prs[i].node.mergedAt)
      }
      if (pr.get('lastMerged')<prs[i].node.mergedAt) {
        pr.set('lastMerged',prs[i].node.mergedAt)
      }
        var repolist = pr.get('repos')
        repolist.push(prs[i].node.repository.name)
        pr.set('repos',repolist)
    }
    else {
      pr = new Map()
      pr.set('lastMerged',prs[i].node.mergedAt)
      pr.set('name',prs[i].node.mergedBy.name)
      pr.set('email',prs[i].node.mergedBy.email)
      pr.set('firstMerged',prs[i].node.mergedAt)
      pr.set('count',1)
      pr.set('repos', [prs[i].node.repository.name])
    }
    data.set(prs[i].node.mergedBy.login,pr)
  }
}

var outputcsv = 'GitHubID,Name,EmailFirstMerge,LastMerge,Count,Repos\n'
for (let [key, value] of data) {
  outputcsv = outputcsv.concat(`"${key}","${value.get('name')}","${value.get('email')}","${value.get('firstMerged')}","${value.get('lastMerged')}","${value.get('count')}","${[...new Set(value.get('repos'))].join()}"\n`)
}
import { createRequire } from "module";
const require = createRequire(import.meta.url);
var fs = require('fs');
fs.writeFile(options.outputCsv, outputcsv, 'utf8', function (err) {
  if (err) {
    console.log('Some error occured - file either not saved or corrupted file saved.');
  } else{
    console.log('It\'s saved!');
  }
});

