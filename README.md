# yarn-plugin-licenses

[![Discord](https://img.shields.io/discord/809577721751142410)](https://discord.gg/YhK3GFcZrk)

Yarn Berry plugin to enforce valid licenses used in a project.

## Usage

Define a `licenses.config.js` file:

```js
module.exports = {
    isValidLicense: (license) => {
        const valid = new RegExp('\\b(mit|apache\\b.*2|bsd|isc|unlicense)\\b', 'i')
        return valid.test(license)
    }
}
```

or

```js
module.exports = {
    isValidLicense: new RegExp('\\b(mit|apache\\b.*2|bsd|isc|unlicense)\\b', 'i'),
    ignorePackages: ['react'],
}
```

or

```js
module.exports = {
    isValidLicense: new RegExp('\\b(mit|apache\\b.*2|bsd|isc|unlicense)\\b', 'i'),
    // You can also provide a function for ignorePackages for more complex cases
    ignorePackages: (packageName, license) => packageName === 'scss-parser' && license === 'SEE LICENSE IN README',
}
```


and then:

```
yarn plugin import https://raw.githubusercontent.com/tophat/yarn-plugin-licenses/master/bundles/@yarnpkg/plugin-licenses-audit.js
yarn licenses audit --output-file=licenses.junit.xml --output-csv=licenses.csv --config=licenses.config.js --summary
```

this outputs a junit report to licenses.junit.xml, a CSV report to licenses.csv, and a summary of any violations to
the console.  You can omit some options to change which files are created or what is output, and if you pass `-` as
a filename it will output to stdout instead of to a file.

You can use `yarn licenses audit --summary` for a human readable report for local dev.

By default license files are not traversed since there's no simple heuristic to parse the file, and developers often put custom wording inside. For this reason, if you would like to parse the license files, pass the `--loose` flag to the CLI.

## Contributors

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://noahnu.com/"><img src="https://avatars.githubusercontent.com/u/1297096?v=4?s=100" width="100px;" alt="Noah"/><br /><sub><b>Noah</b></sub></a><br /><a href="https://github.com/tophat/yarn-plugin-licenses/commits?author=noahnu" title="Code">💻</a> <a href="#infra-noahnu" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://www.linkedin.com/in/kurtvonlaven/"><img src="https://avatars.githubusercontent.com/u/974910?v=4?s=100" width="100px;" alt="Kurt von Laven"/><br /><sub><b>Kurt von Laven</b></sub></a><br /><a href="https://github.com/tophat/yarn-plugin-licenses/commits?author=Kurt-von-Laven" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://dobesv.com"><img src="https://avatars.githubusercontent.com/u/327833?v=4?s=100" width="100px;" alt="Dobes Vandermeer"/><br /><sub><b>Dobes Vandermeer</b></sub></a><br /><a href="https://github.com/tophat/yarn-plugin-licenses/commits?author=dobesv" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/sarahsporck"><img src="https://avatars.githubusercontent.com/u/28013368?v=4?s=100" width="100px;" alt="Sarah"/><br /><sub><b>Sarah</b></sub></a><br /><a href="https://github.com/tophat/yarn-plugin-licenses/commits?author=sarahsporck" title="Code">💻</a> <a href="https://github.com/tophat/yarn-plugin-licenses/issues?q=author%3Asarahsporck" title="Bug reports">🐛</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

To add a contributor to the README, signal the [all-contributors](https://allcontributors.org/) bot by adding comments in your PRs like so:

```
@all-contributors please add <username> for <contribution type>
```
