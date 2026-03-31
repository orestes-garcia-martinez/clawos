export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Scopes must match a known app or package, or be empty
    'scope-enum': [
      2,
      'always',
      [
        'api',
        'web',
        'worker',
        'telegram',
        'shared',
        'billing',
        'security',
        'infra',
        'ci',
        'deps',
        'release',
      ],
    ],
    // Body and footer line length — relaxed for long URLs in changelogs
    'body-max-line-length': [1, 'always', 200],
    'footer-max-line-length': [1, 'always', 200],
  },
};
