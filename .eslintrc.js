module.exports = {
  env: {
    node: true,
    es6: true,
    jest: true
  },
  parser: 'babel-eslint',
  extends: 'eslint:recommended',
  parserOptions: {
    ecmaFeatures: {
      jsx: false
    },
    ecmaVersion: 2018,
    sourceType: 'module'
  },
  plugins: [
    'react'
  ],
  rules: {
    indent: [
      'error',
      2,
      { SwitchCase: 1 }
    ],
    'linebreak-style': [
      'error',
      'unix'
    ],
    quotes: [
      'error',
      'single',
      { avoidEscape: true }
    ],
    semi: [
      'error',
      'always'
    ],
    'react/jsx-uses-react': 'error',
    'react/jsx-uses-vars': 'error',
  },
  overrides: [
    {
      files: ['src/aws-exports.js'],
      rules: {
        indent: [
          'error',
          4,
          { SwitchCase: 1 }
        ],
        quotes: [
          'error',
          'double',
          { avoidEscape: true }
        ]
      }
    },
    {
      files: ['amplify/backend/function/**/*.js'],
      rules: {
        'no-console': [
          'error',
          {
            allow: ['log', 'warn', 'error']
          }
        ]
      }
    }
  ]
};
