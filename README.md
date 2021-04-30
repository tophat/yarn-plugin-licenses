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

and then:

```
yarn import plugin https://raw.githubusercontent.com/tophat/yarn-plugin-licenses/master/bundles/%40yarnpkg/plugin-licenses-audit.js
yarn licenses audit --output-file=- --config=licenses.config.js
```

this outputs a junit report.

You can use `yarn licenses audit --summary` for a human readable report for local dev.

By default license files are not traversed since there's no simple heuristic to parse the file, and developers often put custom wording inside. For this reason, if you would like to parse the license files, pass the `--loose` flag to the CLI.

## Contributors

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tr>
    <td align="center"><a href="https://noahnu.com/"><img src="https://avatars.githubusercontent.com/u/1297096?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Noah</b></sub></a><br /><a href="https://github.com/tophat/yarn-plugin-licenses/commits?author=noahnu" title="Code">💻</a> <a href="#infra-noahnu" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a></td>
  </tr>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

To add a contributor to the README, signal the [all-contributors](https://allcontributors.org/) bot by adding comments in your PRs like so:

```
@all-contributors please add <username> for <contribution type>
```
