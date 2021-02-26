module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint', 'prettier'],
    extends: [
        'plugin:@typescript-eslint/recommended',
        '@tophat/eslint-config/base',
        '@tophat/eslint-config/jest',
        'prettier',
    ],
    rules: {
        'no-unused-vars': 'off', // covered by typescript eslint
        'import/named': 'off',
        'import/order': [
            'error',
            {
                alphabetize: { order: 'asc' },
                'newlines-between': 'always',
                groups: [
                    'unknown',
                    'builtin',
                    'external',
                    'internal',
                    'parent',
                    'sibling',
                    'index',
                ],
            },
        ],
    },
    ignorePatterns: ['.*', '**/*.js', 'lib'],
    settings: {
        'import/parsers': {
            '@typescript-eslint/parser': ['.ts', '.js'],
        },
        'import/resolver': {
            typescript: './tsconfig.json',
        },
    },
}
