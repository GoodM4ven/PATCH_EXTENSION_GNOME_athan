import pkg from '@eslint/js';

const { configs } = pkg;

export default [
    configs.recommended, // Use ESLint's recommended rules
    {
        ignores: ['node_modules/**'], // Ignore node_modules
        languageOptions: {
            ecmaVersion: 'latest', // Equivalent to ES2021+
            sourceType: 'module',
            globals: {
                browser: true,
            },
        },
        rules: {
            // Add your custom rules here if needed
        },
    },
];
