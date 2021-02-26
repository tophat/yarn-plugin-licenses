# yarn-plugin-licenses

Yarn Berry plugin to enforce valid licenses used in a project.

## Usage

Define a `licenses.config.js` file:

```js
module.exports = {
    isValidLicense: license => {
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
yarn import plugin <path-to-git>
yarn licenses audit --output-file=- --config=licenses.config.js
```

this outputs a junit report.

You can use `yarn licenses audit --summary` for a human readable report for local dev.

## Contributors

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- ALL-CONTRIBUTORS-LIST:END -->

To add a contributor to the README, signal the [all-contributors](https://allcontributors.org/) bot by adding comments in your PRs like so:

```
@all-contributors please add <username> for <contribution type>
```
