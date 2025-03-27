import pkg from '@eslint/js';

const { configs } = pkg;

export default [
    configs.recommended,
    {
        ignores: ['node_modules/**'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                browser: true,
            },
        },
        rules: {},
    },
];
